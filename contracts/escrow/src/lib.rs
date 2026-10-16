#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol};

/// Lifecycle states for an escrow.
///
/// `Created` is the documented pre-funding state. An escrow in this state has
/// not received any funds yet, so it can be cancelled by its creator.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Created,
    Funded,
    Released,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub creator: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub amount: i128,
    pub state: EscrowState,
    /// Current deadline (ledger timestamp). `0` means no deadline is set.
    pub deadline: u64,
    /// Number of successful deadline extensions applied so far.
    pub extension_count: u32,
}

/// Maximum number of times a single escrow deadline may be extended.
pub const MAX_EXTENSIONS: u32 = 3;

/// Maximum duration (in seconds) of a single extension.
pub const MAX_EXTENSION_DURATION: u64 = 30 * 24 * 60 * 60;

/// Schema version emitted with every lifecycle event.
///
/// Consumers should key off this version to decode event payloads. Bump it
/// only when the event schema changes in a backwards-incompatible way.
pub const EVENT_VERSION: u32 = 1;

/// Error codes returned by the escrow contract.
///
/// * `AlreadyInitialized` (1) - escrow already exists for this id.
/// * `NotFound` (2) - no escrow exists for this id.
/// * `InvalidAmount` (3) - amount must be strictly positive.
/// * `InvalidState` (4) - operation not allowed in the current state.
/// * `AlreadyCancelled` (5) - escrow was already cancelled (replay rejected).
/// * `ExtensionLimitReached` (6) - maximum extension count already reached.
/// * `InvalidExtension` (7) - extension duration is zero or exceeds the maximum.
/// * `DeadlineOverflow` (8) - computing the new deadline would overflow.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotFound = 2,
    InvalidAmount = 3,
    InvalidState = 4,
    AlreadyCancelled = 5,
    ExtensionLimitReached = 6,
    InvalidExtension = 7,
    DeadlineOverflow = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Escrow(u32),
}

/// Emit a schema-versioned lifecycle event.
///
/// Topics are `(event_name, version)` so consumers can filter by event name
/// and rely on a stable schema version. The escrow `id` and `amount` are
/// included in the data payload for every event.
fn emit_lifecycle(env: &Env, name: Symbol, id: u32, amount: i128) {
    env.events()
        .publish((name, EVENT_VERSION), (id, amount));
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create a new escrow in the pre-funding `Created` state.
    pub fn create(
        env: Env,
        id: u32,
        creator: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        creator.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Escrow(id);
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyInitialized);
        }

        let escrow = Escrow {
            creator,
            beneficiary,
            token,
            amount,
            state: EscrowState::Created,
            deadline: 0,
            extension_count: 0,
        };
        env.storage().persistent().set(&key, &escrow);
        emit_lifecycle(&env, symbol_short!("created"), id, amount);
        Ok(())
    }

    /// Cancel an escrow that has not been funded yet.
    ///
    /// Only the escrow creator may cancel, and only while the escrow is in the
    /// pre-funding `Created` state. On success the escrow transitions to the
    /// terminal `Cancelled` state. A second call fails with
    /// `Error::AlreadyCancelled`, so cancellation cannot be replayed.
    pub fn cancel(env: Env, id: u32) -> Result<(), Error> {
        let key = DataKey::Escrow(id);
        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;

        // Enforce the permitted actor: only the creator may cancel.
        escrow.creator.require_auth();

        match escrow.state {
            EscrowState::Cancelled => return Err(Error::AlreadyCancelled),
            EscrowState::Created => {}
            // Funded/Released escrows can no longer be cancelled.
            _ => return Err(Error::InvalidState),
        }

        escrow.state = EscrowState::Cancelled;
        env.storage().persistent().set(&key, &escrow);
        emit_lifecycle(&env, symbol_short!("refund"), id, escrow.amount);
        Ok(())
    }

    /// Fund an escrow, moving it from `Created` to `Funded`.
    ///
    /// Cancelled escrows are terminal and reject any further operations.
    pub fn fund(env: Env, id: u32, funder: Address) -> Result<(), Error> {
        funder.require_auth();

        let key = DataKey::Escrow(id);
        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;

        match escrow.state {
            EscrowState::Cancelled => return Err(Error::AlreadyCancelled),
            EscrowState::Created => {}
            _ => return Err(Error::InvalidState),
        }

        let client = token::Client::new(&env, &escrow.token);
        client.transfer(&funder, &env.current_contract_address(), &escrow.amount);

        escrow.state = EscrowState::Funded;
        env.storage().persistent().set(&key, &escrow);
        emit_lifecycle(&env, symbol_short!("funded"), id, escrow.amount);
        Ok(())
    }

    /// Extend the deadline of a funded escrow.
    ///
    /// Only the escrow creator may extend the deadline, and only while the
    /// escrow is in the `Funded` state. `extension` is the number of seconds to
    /// add to the current deadline and must be strictly positive and no greater
    /// than `MAX_EXTENSION_DURATION`. At most `MAX_EXTENSIONS` extensions may be
    /// applied per escrow. The new deadline is computed with a checked add so
    /// that a timestamp overflow fails with `Error::DeadlineOverflow` instead of
    /// wrapping.
    pub fn extend_deadline(env: Env, id: u32, extension: u64) -> Result<u64, Error> {
        let key = DataKey::Escrow(id);
        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;

        // Enforce the permitted actor: only the creator may extend.
        escrow.creator.require_auth();

        match escrow.state {
            EscrowState::Cancelled => return Err(Error::AlreadyCancelled),
            EscrowState::Funded => {}
            _ => return Err(Error::InvalidState),
        }

        if extension == 0 || extension > MAX_EXTENSION_DURATION {
            return Err(Error::InvalidExtension);
        }

        if escrow.extension_count >= MAX_EXTENSIONS {
            return Err(Error::ExtensionLimitReached);
        }

        let base = if escrow.deadline == 0 {
            env.ledger().timestamp()
        } else {
            escrow.deadline
        };

        let new_deadline = base.checked_add(extension).ok_or(Error::DeadlineOverflow)?;

        escrow.deadline = new_deadline;
        escrow.extension_count += 1;
        env.storage().persistent().set(&key, &escrow);
        Ok(new_deadline)
    }

    /// Read the current escrow record.
    pub fn get(env: Env, id: u32) -> Result<Escrow, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(id))
            .ok_or(Error::NotFound)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Env};

    fn setup() -> (Env, EscrowContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let token = Address::generate(&env);
        (env, client, creator, beneficiary, token)
    }

    #[test]
    fn cancel_before_funding_succeeds() {
        let (_env, client, creator, beneficiary, token) = setup();
        client.create(&1, &creator, &beneficiary, &token, &100);

        client.cancel(&1);

        let escrow = client.get(&1);
        assert_eq!(escrow.state, EscrowState::Cancelled);
    }

    #[test]
    fn cancel_requires_creator_auth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let token = Address::generate(&env);

        env.mock_all_auths();
        client.create(&1, &creator, &beneficiary, &token, &100);

        env.set_auths(&[]);
        let result = client.try_cancel(&1);
        assert!(result.is_err());
    }

    #[test]
    fn create_emits_versioned_event() {
        let (env, client, creator, beneficiary, token) = setup();
        client.create(&7, &creator, &beneficiary, &token, &250);

        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, (symbol_short!("created"), EVENT_VERSION));
        assert_eq!(last.1, (7u32, 250i128));
    }

    #[test]
    fn fund_emits_versioned_event() {
        let (env, client, creator, beneficiary, token) = setup();
        client.create(&8, &creator, &beneficiary, &token, &300);
        client.fund(&8, &creator);

        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, (symbol_short!("funded"), EVENT_VERSION));
        assert_eq!(last.1, (8u32, 300i128));
    }

    #[test]
    fn cancel_emits_versioned_refund_event() {
        let (env, client, creator, beneficiary, token) = setup();
        client.create(&9, &creator, &beneficiary, &token, &400);
        client.cancel(&9);

        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, (symbol_short!("refund"), EVENT_VERSION));
        assert_eq!(last.1, (9u32, 400i128));
    }
}
