use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EscrowState {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone)]
pub struct Escrow {
    pub depositor: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub amount: i128,
    pub expiry: u64,
    pub state: EscrowState,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
        expiry: u64,
    ) {
        depositor.require_auth();
        assert!(amount > 0, "amount must be positive");
        let escrow = Escrow {
            depositor: depositor.clone(),
            beneficiary,
            token,
            amount,
            expiry,
            state: EscrowState::Pending,
        };
        env.storage().persistent().set(&depositor, &escrow);
    }

    pub fn release(env: Env, depositor: Address) {
        let mut escrow = Self::load(&env, &depositor);
        assert!(escrow.state == EscrowState::Pending, "escrow already settled");
        escrow.state = EscrowState::Released;
        env.storage().persistent().set(&depositor, &escrow);
        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );
    }

    pub fn cancel(env: Env, depositor: Address) {
        let mut escrow = Self::load(&env, &depositor);
        assert!(escrow.state == EscrowState::Pending, "escrow already settled");
        escrow.state = EscrowState::Refunded;
        env.storage().persistent().set(&depositor, &escrow);
        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.depositor,
            &escrow.amount,
        );
    }

    pub fn expire(env: Env, depositor: Address) {
        let mut escrow = Self::load(&env, &depositor);
        assert!(escrow.state == EscrowState::Pending, "escrow already settled");
        assert!(env.ledger().timestamp() >= escrow.expiry, "escrow not expired");
        escrow.state = EscrowState::Refunded;
        env.storage().persistent().set(&depositor, &escrow);
        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.depositor,
            &escrow.amount,
        );
    }

    pub fn get(env: Env, depositor: Address) -> Escrow {
        Self::load(&env, &depositor)
    }

    fn load(env: &Env, depositor: &Address) -> Escrow {
        env.storage()
            .persistent()
            .get(depositor)
            .expect("escrow not found")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

    fn setup(env: &Env) -> (Address, Address, Address, Address) {
        let admin = Address::generate(env);
        let depositor = Address::generate(env);
        let beneficiary = Address::generate(env);
        let token_id = env.register_stellar_asset_contract(admin);
        StellarAssetClient::new(env, &token_id).mint(&depositor, &1000);
        (depositor, beneficiary, token_id, env.register_contract(None, EscrowContract))
    }

    #[test]
    fn release_settles_once() {
        let env = Env::default();
        env.mock_all_auths();
        let (depositor, beneficiary, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &token_id, &1000, &100);
        client.release(&depositor);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&beneficiary), 1000);
        assert_eq!(client.get(&depositor).state, EscrowState::Released);
        assert!(client.try_release(&depositor).is_err());
        assert_eq!(TokenClient::new(&env, &token_id).balance(&beneficiary), 1000);
    }

    #[test]
    fn cancel_settles_once() {
        let env = Env::default();
        env.mock_all_auths();
        let (depositor, beneficiary, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &token_id, &1000, &100);
        client.cancel(&depositor);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&depositor), 1000);
        assert_eq!(client.get(&depositor).state, EscrowState::Refunded);
        assert!(client.try_cancel(&depositor).is_err());
        assert_eq!(TokenClient::new(&env, &token_id).balance(&depositor), 1000);
    }

    #[test]
    fn expire_settles_once() {
        let env = Env::default();
        env.mock_all_auths();
        let (depositor, beneficiary, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &token_id, &1000, &100);
        env.ledger().set_timestamp(200);
        client.expire(&depositor);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&depositor), 1000);
        assert_eq!(client.get(&depositor).state, EscrowState::Refunded);
        assert!(client.try_expire(&depositor).is_err());
        assert_eq!(TokenClient::new(&env, &token_id).balance(&depositor), 1000);
    }

    #[test]
    fn cross_path_double_settlement_is_blocked() {
        let env = Env::default();
        env.mock_all_auths();
        let (depositor, beneficiary, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &token_id, &1000, &100);
        client.release(&depositor);
        assert!(client.try_cancel(&depositor).is_err());
        assert!(client.try_expire(&depositor).is_err());
        assert_eq!(TokenClient::new(&env, &token_id).balance(&beneficiary), 1000);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&depositor), 0);
    }

    #[test]
    fn failed_transfer_rolls_back_state() {
        let env = Env::default();
        env.mock_all_auths();
        let (depositor, beneficiary, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &token_id, &1000, &100);
        // Drain the contract so the transfer fails.
        StellarAssetClient::new(&env, &token_id).mint(&escrow_id, &0);
        assert!(client.try_release(&depositor).is_err());
        assert_eq!(client.get(&depositor).state, EscrowState::Pending);
    }
}
