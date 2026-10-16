#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

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
}

/// Error codes returned by the escrow contract.
///
/// * `AlreadyInitialized` (1) - escrow already exists for this id.
/// * `NotFound` (2) - no escrow exists for this id.
/// * `InvalidAmount` (3) - amount must be strictly positive.
/// * `InvalidState` (4) - operation not allowed in the current state.
/// * `AlreadyCancelled` (5) - escrow was already cancelled (replay rejected).
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotFound = 2,
    InvalidAmount = 3,
    InvalidState = 4,
    AlreadyCancelled = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Escrow(u32),
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
        };
        env.storage().persistent().set(&key, &escrow);
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
        Ok(())
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
    use soroban_sdk::{testutils::Address as _, Env};

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

        // Without mocked auth the creator's authorization is not satisfied.
        env.set_auths(&[]);
        let result = client.try_cancel(&1);
        assert!(result.is_err());
    }

    #[test]
    fn cancel_after_funding_fails() {
        let (_env, client, creator, beneficiary, token) = setup();
        client.create(&1, &creator, &beneficiary, &token, &100);
        client.fund(&1, &creator);

        let result = client.try_cancel(&1);
        assert_eq!(result, Err(Ok(Error::InvalidState)));
    }

    #[test]
    fn cancel_cannot_be_replayed() {
        let (_env, client, creator, beneficiary, token) = setup();
        client.create(&1, &creator, &beneficiary, &token, &100);

        client.cancel(&1);
        let result = client.try_cancel(&1);
        assert_eq!(result, Err(Ok(Error::AlreadyCancelled)));
    }

    #[test]
    fn cancelled_escrow_rejects_funding() {
        let (_env, client, creator, beneficiary, token) = setup();
        client.create(&1, &creator, &beneficiary, &token, &100);
        client.cancel(&1);

        let result = client.try_fund(&1, &creator);
        assert_eq!(result, Err(Ok(Error::AlreadyCancelled)));
    }

    #[test]
    fn cancel_unknown_escrow_fails() {
        let (_env, client, _creator, _beneficiary, _token) = setup();
        let result = client.try_cancel(&99);
        assert_eq!(result, Err(Ok(Error::NotFound)));
    }
}
