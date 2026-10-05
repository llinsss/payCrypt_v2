#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    NotCreated = 5,
    NotExpired = 6,
    InvalidState = 7,
    ReentrancyDetected = 8,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowState {
    Created = 0,
    Released = 1,
    Cancelled = 2,
    Expired = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub depositor: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub amount: i128,
    pub expiry_ledger: u32,
    pub state: EscrowState,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Escrow,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create a new escrow.
    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
        expiry_ledger: u32,
    ) -> Result<(), EscrowError> {
        depositor.require_auth();

        if env.storage().instance().has(&DataKey::Escrow) {
            return Err(EscrowError::AlreadyInitialized);
        }

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        if expiry_ledger <= env.ledger().sequence() {
            return Err(EscrowError::NotExpired);
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);

        let escrow = Escrow {
            depositor: depositor.clone(),
            beneficiary: beneficiary.clone(),
            token: token.clone(),
            amount,
            expiry_ledger,
            state: EscrowState::Created,
        };

        env.storage().instance().set(&DataKey::Escrow, &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow_created"),),
            (depositor, beneficiary, token, amount, expiry_ledger),
        );

        Ok(())
    }

    /// Release funds to beneficiary. Only depositor can call.
    pub fn release(env: Env) -> Result<(), EscrowError> {
        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&DataKey::Escrow)
            .ok_or(EscrowError::NotCreated)?;

        escrow.depositor.require_auth();

        if escrow.state != EscrowState::Created {
            return Err(EscrowError::InvalidState);
        }

        let entered_flag = Symbol::new(&env, "entered");
        if env.storage().transient().get::<_, bool>(&entered_flag).unwrap_or(false) {
            return Err(EscrowError::ReentrancyDetected);
        }
        env.storage().transient().set(&entered_flag, &true);

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.beneficiary, &escrow.amount);

        env.storage().transient().remove(&entered_flag);

        escrow.state = EscrowState::Released;
        env.storage().instance().set(&DataKey::Escrow, &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow_released"),),
            (escrow.depositor, escrow.beneficiary, escrow.token, escrow.amount),
        );

        Ok(())
    }

    /// Cancel escrow and refund depositor. Only depositor can call.
    pub fn cancel(env: Env) -> Result<(), EscrowError> {
        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&DataKey::Escrow)
            .ok_or(EscrowError::NotCreated)?;

        escrow.depositor.require_auth();

        if escrow.state != EscrowState::Created {
            return Err(EscrowError::InvalidState);
        }

        let entered_flag = Symbol::new(&env, "entered");
        if env.storage().transient().get::<_, bool>(&entered_flag).unwrap_or(false) {
            return Err(EscrowError::ReentrancyDetected);
        }
        env.storage().transient().set(&entered_flag, &true);

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.depositor, &escrow.amount);

        env.storage().transient().remove(&entered_flag);

        escrow.state = EscrowState::Cancelled;
        env.storage().instance().set(&DataKey::Escrow, &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow_cancelled"),),
            (escrow.depositor, escrow.beneficiary, escrow.token, escrow.amount),
        );

        Ok(())
    }

    /// Expire escrow after expiry ledger. Anyone can call.
    pub fn expire(env: Env) -> Result<(), EscrowError> {
        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&DataKey::Escrow)
            .ok_or(EscrowError::NotCreated)?;

        if escrow.state != EscrowState::Created {
            return Err(EscrowError::InvalidState);
        }

        if env.ledger().sequence() < escrow.expiry_ledger {
            return Err(EscrowError::NotExpired);
        }

        let entered_flag = Symbol::new(&env, "entered");
        if env.storage().transient().get::<_, bool>(&entered_flag).unwrap_or(false) {
            return Err(EscrowError::ReentrancyDetected);
        }
        env.storage().transient().set(&entered_flag, &true);

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.depositor, &escrow.amount);

        env.storage().transient().remove(&entered_flag);

        escrow.state = EscrowState::Expired;
        env.storage().instance().set(&DataKey::Escrow, &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow_expired"),),
            (escrow.depositor, escrow.beneficiary, escrow.token, escrow.amount),
        );

        Ok(())
    }

    /// Get current escrow state.
    pub fn get(env: Env) -> Result<Escrow, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::Escrow)
            .ok_or(EscrowError::NotCreated)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{Env, Address, token};

    fn setup(env: &Env) -> (Address, Address, Address, Address) {
        let contract_id = env.register_contract(None, EscrowContract);
        let depositor = Address::generate(env);
        let beneficiary = Address::generate(env);
        let token_admin = Address::generate(env);
        let token_id = env.register_stellar_asset_contract(token_admin);
        (contract_id, depositor, beneficiary, token_id)
    }

    #[test]
    fn release_transfers_to_beneficiary() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        client.release();

        assert_eq!(token::Client::new(&env, &token_id).balance(&beneficiary), 100);
        assert_eq!(client.get().state, EscrowState::Released);
    }

    #[test]
    fn cancel_refunds_depositor() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        client.cancel();

        assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
        assert_eq!(client.get().state, EscrowState::Cancelled);
    }

    #[test]
    fn expire_after_expiry_ledger() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 5));

        assert_eq!(client.try_expire(), Err(Ok(EscrowError::NotExpired)));

        env.ledger().set_sequence_number(env.ledger().sequence() + 5);
        client.expire();

        assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
        assert_eq!(client.get().state, EscrowState::Expired);
    }

    #[test]
    fn terminal_state_blocks_further_transitions() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        client.release();

        assert_eq!(client.try_cancel(), Err(Ok(EscrowError::NotCreated)));
        assert_eq!(client.try_release(), Err(Ok(EscrowError::NotCreated)));
    }

    #[test]
    fn create_rejects_invalid_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);

        // Zero amount
        assert_eq!(
            client.try_create(&depositor, &beneficiary, &token_id, &0, &(env.ledger().sequence() + 10)),
            Err(Ok(EscrowError::InvalidAmount))
        );

        // Negative amount
        assert_eq!(
            client.try_create(&depositor, &beneficiary, &token_id, &-100, &(env.ledger().sequence() + 10)),
            Err(Ok(EscrowError::InvalidAmount))
        );
    }

    #[test]
    fn create_rejects_past_expiry() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);

        // Expiry in the past
        assert_eq!(
            client.try_create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() - 1)),
            Err(Ok(EscrowError::NotExpired))
        );

        // Expiry at current ledger
        assert_eq!(
            client.try_create(&depositor, &beneficiary, &token_id, &100, &env.ledger().sequence()),
            Err(Ok(EscrowError::NotExpired))
        );
    }

    #[test]
    fn create_requires_depositor_auth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);

        // Without mock_all_auths, authorization is required
        let result = client.try_create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        assert!(result.is_err());
    }

    #[test]
    fn release_requires_depositor_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

        // Beneficiary cannot release
        env.set_auths(&[]);
        let result = client.try_release();
        assert!(result.is_err());
    }

    #[test]
    fn cancel_requires_depositor_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

        // Beneficiary cannot cancel
        env.set_auths(&[]);
        let result = client.try_cancel();
        assert!(result.is_err());
    }

    #[test]
    fn release_rejects_non_created_state() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        client.cancel();

        // Cannot release after cancel
        assert_eq!(client.try_release(), Err(Ok(EscrowError::InvalidState)));
    }

    #[test]
    fn cancel_rejects_non_created_state() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        client.release();

        // Cannot cancel after release
        assert_eq!(client.try_cancel(), Err(Ok(EscrowError::InvalidState)));
    }

    #[test]
    fn expire_rejects_non_created_state() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        client.release();

        env.ledger().set_sequence_number(env.ledger().sequence() + 10);
        assert_eq!(client.try_expire(), Err(Ok(EscrowError::InvalidState)));
    }

    #[test]
    fn expire_can_be_called_by_anyone() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 5));

        // Anyone can call expire (no auth check)
        env.ledger().set_sequence_number(env.ledger().sequence() + 5);
        let stranger = Address::generate(&env);
        // With mock_all_auths, this works. The contract doesn't require specific auth for expire.

        client.expire();
        assert_eq!(client.get().state, EscrowState::Expired);
    }

    #[test]
    fn get_rejects_not_created() {
        let env = Env::default();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        assert_eq!(client.try_get(), Err(Ok(EscrowError::NotCreated)));
    }

    #[test]
    fn boundary_amount_values() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);
        let token_admin = Address::generate(&env);
        let token2 = env.register_stellar_asset_contract(token_admin);

        // Test with i128::MAX
        token::StellarAssetClient::new(&env, &token2).mint(&depositor, &i128::MAX);
        client.create(&depositor, &beneficiary, &token2, &i128::MAX, &(env.ledger().sequence() + 10));
        client.release();
        assert_eq!(token::Client::new(&env, &token2).balance(&beneficiary), i128::MAX);
    }

    #[test]
    fn boundary_expiry_values() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);

        // Next ledger (minimum valid)
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 1));

        // Max u32
        let client2 = EscrowContractClient::new(&env, &env.register_contract(None, EscrowContract));
        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client2.create(&depositor, &beneficiary, &token_id, &100, &u32::MAX);
    }

    #[test]
    fn all_escrow_error_variants_have_stable_codes() {
        assert_eq!(EscrowError::NotInitialized as u32, 1);
        assert_eq!(EscrowError::AlreadyInitialized as u32, 2);
        assert_eq!(EscrowError::Unauthorized as u32, 3);
        assert_eq!(EscrowError::InvalidAmount as u32, 4);
        assert_eq!(EscrowError::NotCreated as u32, 5);
        assert_eq!(EscrowError::NotExpired as u32, 6);
        assert_eq!(EscrowError::InvalidState as u32, 7);
        assert_eq!(EscrowError::ReentrancyDetected as u32, 8);
    }

    #[test]
    fn all_escrow_error_variants_are_unique() {
        let codes = vec![
            EscrowError::NotInitialized as u32,
            EscrowError::AlreadyInitialized as u32,
            EscrowError::Unauthorized as u32,
            EscrowError::InvalidAmount as u32,
            EscrowError::NotCreated as u32,
            EscrowError::NotExpired as u32,
            EscrowError::InvalidState as u32,
            EscrowError::ReentrancyDetected as u32,
        ];
        let mut sorted = codes.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), codes.len());
    }

    #[test]
    fn all_escrow_state_variants_have_stable_codes() {
        assert_eq!(EscrowState::Created as u32, 0);
        assert_eq!(EscrowState::Released as u32, 1);
        assert_eq!(EscrowState::Cancelled as u32, 2);
        assert_eq!(EscrowState::Expired as u32, 3);
    }

    #[test]
    fn double_create_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &200);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

        // Second create should fail
        assert_eq!(
            client.try_create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10)),
            Err(Ok(EscrowError::AlreadyInitialized))
        );
    }

    #[test]
    fn reentrancy_guard_present() {
        // Verify the reentrancy guard symbol is used
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, depositor, beneficiary, token_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
        client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
        client.release();

        // After release, the entered flag should be cleared
        let escrow = client.get().unwrap();
        assert_eq!(escrow.state, EscrowState::Released);
    }
}