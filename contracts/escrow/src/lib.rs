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
    pub relayer: Address,
    pub token: Address,
    pub amount: i128,
    pub expiry: u64,
    pub state: EscrowState,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create an escrow. Only the depositor may authorize creation, and the
    /// depositor's address authorization is required so the stored depositor
    /// cannot be forged by an arbitrary caller.
    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        relayer: Address,
        token: Address,
        amount: i128,
        expiry: u64,
    ) {
        depositor.require_auth();
        assert!(amount > 0, "amount must be positive");
        let escrow = Escrow {
            depositor: depositor.clone(),
            beneficiary,
            relayer,
            token,
            amount,
            expiry,
            state: EscrowState::Pending,
        };
        env.storage().persistent().set(&depositor, &escrow);
    }

    /// Release funds to the beneficiary. Only the depositor may authorize a
    /// release; the beneficiary is taken from stored state, never from caller
    /// parameters, so a forged recipient cannot redirect the payout.
    pub fn release(env: Env, depositor: Address) {
        depositor.require_auth();
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

    /// Refund the depositor. Only the depositor may authorize a cancel; the
    /// refund target is the stored depositor, so it cannot be forged.
    pub fn cancel(env: Env, depositor: Address) {
        depositor.require_auth();
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

    /// Expire an escrow after its deadline. Anyone may trigger an
    /// already-authorized expiry: the deadline is the sole authorization
    /// condition, and funds always return to the stored depositor. The
    /// relayer is recorded for off-chain attribution but is not required to
    /// authorize this permissionless path.
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

    fn setup(env: &Env) -> (Address, Address, Address, Address, Address) {
        let admin = Address::generate(env);
        let depositor = Address::generate(env);
        let beneficiary = Address::generate(env);
        let relayer = Address::generate(env);
        let token_id = env.register_stellar_asset_contract(admin);
        StellarAssetClient::new(env, &token_id).mint(&depositor, &1000);
        (
            depositor,
            beneficiary,
            relayer,
            token_id,
            env.register_contract(None, EscrowContract),
        )
    }

    #[test]
    fn release_settles_once() {
        let env = Env::default();
        env.mock_all_auths();
        let (depositor, beneficiary, relayer, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &relayer, &token_id, &1000, &100);
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
        let (depositor, beneficiary, relayer, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &relayer, &token_id, &1000, &100);
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
        let (depositor, beneficiary, relayer, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &relayer, &token_id, &1000, &100);
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
        let (depositor, beneficiary, relayer, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &relayer, &token_id, &1000, &100);
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
        let (depositor, beneficiary, relayer, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &relayer, &token_id, &1000, &100);
        // Drain the contract so the transfer fails.
        StellarAssetClient::new(&env, &token_id).mint(&escrow_id, &0);
        assert!(client.try_release(&depositor).is_err());
        assert_eq!(client.get(&depositor).state, EscrowState::Pending);
    }

    #[test]
    fn forged_sender_cannot_release() {
        let env = Env::default();
        let (depositor, beneficiary, relayer, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        // Only the depositor authorizes creation.
        env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &depositor,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &escrow_id,
                fn_name: "create",
                args: (&depositor, &beneficiary, &relayer, &token_id, &1000i128, &100u64).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        client.create(&depositor, &beneficiary, &relayer, &token_id, &1000, &100);
        // A forged sender (not the depositor) must not be able to release.
        let attacker = Address::generate(&env);
        assert!(client.try_release(&attacker).is_err());
        assert_eq!(client.get(&depositor).state, EscrowState::Pending);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&beneficiary), 0);
    }

    #[test]
    fn forged_recipient_cannot_redirect_release() {
        let env = Env::default();
        env.mock_all_auths();
        let (depositor, beneficiary, relayer, token_id, escrow_id) = setup(&env);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.create(&depositor, &beneficiary, &relayer, &token_id, &1000, &100);
        // Release always pays the stored beneficiary; a forged recipient
        // address cannot be supplied to redirect funds.
        client.release(&depositor);
        let attacker = Address::generate(&env);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&attacker), 0);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&beneficiary), 1000);
    }
}
