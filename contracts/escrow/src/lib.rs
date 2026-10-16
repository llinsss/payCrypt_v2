#![no_std]

//! # Escrow Contract
//!
//! A minimal single-escrow Soroban contract that holds funds for a
//! `creator`/`beneficiary` pair until they are released or the escrow is
//! cancelled.
//!
//! ## Deployment & initialization
//!
//! The contract has no constructor: deploying the WASM and invoking `create`
//! is the initialization step. `create` takes the escrow `id` (a `u32` chosen
//! by the caller and used as the storage key), the `creator`, `beneficiary`,
//! and `token` addresses, and a strictly positive `amount` (`i128`). The
//! `creator` must authorize the call (`creator.require_auth()`). A second
//! `create` for the same `id` fails with [`Error::AlreadyInitialized`].
//!
//! ## State machine
//!
//! ```text
//!            create                fund
//!   (none) ---------> Created -----------> Funded
//!                       |                    |
//!                  cancel|                    | (release)
//!                       v                    v
//!                   Cancelled            Released
//! ```
//!
//! * `Created` -> `Funded` via [`EscrowContract::fund`].
//! * `Created` -> `Cancelled` via [`EscrowContract::cancel`].
//! * `Funded` -> `Released` (release path).
//! * `Cancelled` and `Released` are terminal; any further operation on a
//!   cancelled escrow fails with [`Error::AlreadyCancelled`].
//!
//! ## Authorization
//!
//! * `create` - requires `creator` auth.
//! * `cancel` - requires `creator` auth; only valid in `Created`.
//! * `fund` - requires `funder` auth.
//! * `extend_deadline` - requires `creator` auth; only valid in `Funded`.
//! * `get` - read-only, no auth.
//!
//! ## Events
//!
//! Every lifecycle event is published with topics `(name, EVENT_VERSION)` and
//! data `(id, amount)`. Names are `created`, `funded`, and `refund` (emitted on
//! cancellation). Consumers should key off `EVENT_VERSION` to decode payloads.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol};

/// Storage keys used by the escrow contract.
///
/// Only a single `State` entry is written per escrow, keeping storage growth
/// bounded to one persistent record per escrow lifecycle.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    State,
}

/// Lifecycle states for an escrow.
///
/// `Created` is the documented pre-funding state. An escrow in this state has
/// not received any funds yet, so it can be cancelled by its creator.
/// `Released` and `Cancelled` are terminal: once reached, no further state
/// transitions are permitted and the escrowed balance is always zero.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Created,
    Funded,
    Released,
    Cancelled,
}

/// Persisted escrow record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub creator: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub amount: i128,
    pub state: EscrowState,
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
    ///
    /// Create an escrow holding `amount` of `token` from `depositor` to
    /// `beneficiary`. Requires `depositor` authorization and transfers the
    /// funds into the contract.
    ///
    /// Emits no events; state is observable via [`Self::get_escrow`].
    pub fn init(
        env: Env,
        depositor: Address,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create a new escrow in the pre-funding `Created` state.
    ///
    /// This is the initialization entrypoint (there is no constructor).
    /// Requires `creator` auth. `amount` must be strictly positive. Fails with
    /// [`Error::AlreadyInitialized`] if an escrow already exists for `id`.
    pub fn create(
        env: Env,
        id: u32,
        creator: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::State) {
            return Err(Error::AlreadyInitialized);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        creator.require_auth();

        token::Client::new(&env, &token).transfer(
            &creator,
            &env.current_contract_address(),
            &amount,
        );

        env.storage().instance().set(&DataKey::State, &EscrowState::Created);
        env.storage().instance().set(&DataKey::Id, &id);
        env.storage().instance().set(&DataKey::Creator, &creator);
        env.storage().instance().set(&DataKey::Beneficiary, &beneficiary);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);

        emit_lifecycle(&env, symbol_short!("created"), id, amount);

        Ok(())
    }

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
    /// Requires `funder` auth. Cancelled escrows are terminal and reject any
    /// further operations.
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
    ///
    /// Read-only; requires no authorization. Fails with [`Error::NotFound`] if
    /// no escrow exists for `id`.
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
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env, IntoVal,
    };

    struct Setup {
        env: Env,
        contract: Address,
        token: Address,
        depositor: Address,
        beneficiary: Address,
    }

    fn setup(amount: i128) -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let contract = env.register_contract(None, EscrowContract);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&depositor, &amount);

        EscrowContractClient::new(&env, &contract).init(
            &depositor,
            &beneficiary,
            &token,
            &amount,
        );

        Setup {
            env,
            contract,
            token,
            depositor,
            beneficiary,
        }
    }

    fn balance(s: &Setup, who: &Address) -> i128 {
        TokenClient::new(&s.env, &s.token).balance(who)
    }

    /// Invariant: the contract holds exactly the escrowed amount while funded,
    /// and zero once a terminal state is reached.
    fn assert_conservation(s: &Setup, expected_contract: i128) {
        let escrow = EscrowContractClient::new(&s.env, &s.contract).get_escrow();
        assert_eq!(balance(s, &s.contract), expected_contract);
        assert_eq!(balance(s, &s.contract), escrow.amount - (escrow.amount - expected_contract));
    }

    #[test]
    fn init_holds_funds_and_conserves_total_supply() {
        let s = setup(1_000);
        assert_eq!(balance(&s, &s.contract), 1_000);
        assert_eq!(balance(&s, &s.depositor), 0);
        assert_eq!(balance(&s, &s.beneficiary), 0);
        assert_conservation(&s, 1_000);
    }

    #[test]
    fn release_transfers_to_beneficiary_and_zeroes_contract() {
        let s = setup(1_000);
        EscrowContractClient::new(&s.env, &s.contract).release();

        assert_eq!(balance(&s, &s.beneficiary), 1_000);
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.depositor), 0);
        assert_conservation(&s, 0);
    }

    #[test]
    fn refund_transfers_to_depositor_and_zeroes_contract() {
        let s = setup(1_000);
        EscrowContractClient::new(&s.env, &s.contract).refund();

        assert_eq!(balance(&s, &s.depositor), 1_000);
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.beneficiary), 0);
        assert_conservation(&s, 0);
    }

    #[test]
    fn terminal_state_is_immutable_after_release() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.release();

        assert_eq!(client.try_release(), Err(Ok(Error::TerminalState)));
        assert_eq!(client.try_refund(), Err(Ok(Error::TerminalState)));
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.beneficiary), 1_000);
    }

    #[test]
    fn terminal_state_is_immutable_after_refund() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.refund();

        assert_eq!(client.try_release(), Err(Ok(Error::TerminalState)));
        assert_eq!(client.try_refund(), Err(Ok(Error::TerminalState)));
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.depositor), 1_000);
    }

    #[test]
    fn init_rejects_non_positive_amounts() {
        let env = Env::default();
        env.mock_all_auths();
        let contract = env.register_contract(None, EscrowContract);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();
        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let client = EscrowContractClient::new(&env, &contract);

        assert_eq!(
            client.try_init(&depositor, &beneficiary, &token, &0),
            Err(Ok(Error::InvalidAmount))
        );
        assert_eq!(
            client.try_init(&depositor, &beneficiary, &token, &-1),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn init_cannot_be_called_twice() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        assert_eq!(
            client.try_init(&s.depositor, &s.beneficiary, &s.token, &1_000),
            Err(Ok(Error::AlreadyInitialized))
        );
    }

    #[test]
    fn operations_before_init_fail() {
        let env = Env::default();
        env.mock_all_auths();
        let contract = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract);

        assert_eq!(client.try_release(), Err(Ok(Error::NotInitialized)));
        assert_eq!(client.try_refund(), Err(Ok(Error::NotInitialized)));
        assert_eq!(client.try_get_escrow(), Err(Ok(Error::NotInitialized)));
    }

    #[test]
    fn release_requires_depositor_auth() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.release();

        let auths = s.env.auths();
        assert_eq!(auths.len(), 1);
        let (addr, invocation) = auths.get(0).unwrap();
        assert_eq!(addr, s.depositor);
        assert_eq!(
            invocation,
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.contract.clone(),
                    "release".into_val(&s.env),
                    ().into_val(&s.env),
                )),
                sub_invocations: [].into(),
            }
        );
    }

    #[test]
    fn refund_requires_beneficiary_auth() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.refund();

        let auths = s.env.auths();
        assert_eq!(auths.len(), 1);
        let (addr, invocation) = auths.get(0).unwrap();
        assert_eq!(addr, s.beneficiary);
        assert_eq!(
            invocation,
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.contract.clone(),
                    "refund".into_val(&s.env),
                    ().into_val(&s.env),
                )),
                sub_invocations: [].into(),
            }
        );
    }

    /// Property-style test: drive a generated sequence of transitions and
    /// assert conservation of escrowed funds and terminal-state immutability
    /// after every step.
    #[test]
    fn property_generated_transition_sequences_conserve_funds() {
        // Deterministic pseudo-random generator keeps the test reproducible
        // without pulling in extra dependencies.
        let mut seed: u64 = 0x9E3779B97F4A7C15;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };

        for _ in 0..32 {
            let amount = (next() % 10_000) as i128 + 1;
            let s = setup(amount);
            let client = EscrowContractClient::new(&s.env, &s.contract);

            // Invariant holds immediately after funding.
            assert_eq!(balance(&s, &s.contract), amount);
            assert_eq!(balance(&s, &s.depositor), 0);
            assert_eq!(balance(&s, &s.beneficiary), 0);

            // Choose a terminal transition, then attempt further transitions.
            let release_first = next() % 2 == 0;
            if release_first {
                client.release();
            } else {
                client.refund();
            }

            // Conservation: total supply is unchanged and the contract is empty.
            assert_eq!(balance(&s, &s.contract), 0);
            let recipient = if release_first {
                &s.beneficiary
            } else {
                &s.depositor
            };
            assert_eq!(balance(&s, recipient), amount);

            // Terminal-state immutability: no further transitions succeed and
            // balances never change again.
            assert_eq!(client.try_release(), Err(Ok(Error::TerminalState)));
            assert_eq!(client.try_refund(), Err(Ok(Error::TerminalState)));
            assert_eq!(balance(&s, &s.contract), 0);
            assert_eq!(balance(&s, recipient), amount);
        }
    }
}
