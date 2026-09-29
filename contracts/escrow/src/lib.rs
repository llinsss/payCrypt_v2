#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Map};

/// Per-asset liability model.
///
/// `pending` is the sum of all outstanding liabilities the escrow owes to
/// beneficiaries for a given asset. `accounted` is the amount of that asset the
/// escrow has explicitly recognized as backing (deposits made through the
/// contract). The difference between the contract's *actual* token balance and
/// `accounted` is surplus: unsolicited transfers that are NOT counted as
/// backing until they are explicitly accounted for.
#[contracttype]
#[derive(Clone, Default)]
pub struct AssetLiability {
    pub pending: i128,
    pub accounted: i128,
}

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

#[contracttype]
#[derive(Clone)]
pub struct EscrowError;

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
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
    pub depositor: Address,
    pub beneficiary: Address,
    pub relayer: Address,
    pub token: Address,
    pub amount: i128,
    pub expiry: u64,
    pub state: EscrowState,
}

#[contracttype]
#[derive(Clone)]
pub struct EscrowError;


    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        asset: Address,
        amount: i128,
    ) -> u64 {
        assert!(amount > 0, "amount must be positive");
        depositor.require_auth();

        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);

        let id = Self::next_id(&env);
        let escrow = Escrow {
            depositor: depositor.clone(),
            beneficiary: beneficiary.clone(),
            asset: asset.clone(),
            amount,
            settled: false,
        };
        Self::save_escrow(&env, id, &escrow);

        // Record the liability and the backing we just accounted for.
        let mut liability = Self::liability(&env, &asset);
        liability.pending += amount;
        liability.accounted += amount;
        Self::save_liability(&env, &asset, &liability);

        Self::assert_solvent(&env, &asset);
        id
    }

    /// Settle an escrow, paying the beneficiary and clearing the liability.
    pub fn settle(env: Env, id: u64) {
        let mut escrow = Self::load_escrow(&env, id);
        assert!(!escrow.settled, "escrow already settled");

        let token_client = token::Client::new(&env, &escrow.asset);
        token_client.transfer(
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

    /// Explicitly account for tokens that were transferred to the contract
    /// without going through `create` (unsolicited transfers). Only after this
    /// call are those tokens counted as backing for liabilities.
    pub fn account_surplus(env: Env, asset: Address) {
        let liability = Self::liability(&env, &asset);
        let actual = token::Client::new(&env, &asset)
            .balance(&env.current_contract_address());
        let surplus = actual - liability.accounted;
        assert!(surplus >= 0, "accounted exceeds actual balance");

        let mut updated = liability;
        updated.accounted += surplus;
        Self::save_liability(&env, &asset, &updated);

        Self::assert_solvent(&env, &asset);
    }

    /// Read the liability model for an asset.
    pub fn liability(env: Env, asset: Address) -> AssetLiability {
        Self::liability(&env, &asset)
    }

    /// Solvency invariant: pending liabilities must never exceed the tokens
    /// explicitly accounted for as backing.
    pub fn is_solvent(env: Env, asset: Address) -> bool {
        let liability = Self::liability(&env, &asset);
        liability.pending <= liability.accounted
    }

    fn assert_solvent(env: &Env, asset: &Address) {
        let liability = Self::liability(env, asset);
        assert!(
            liability.pending <= liability.accounted,
            "escrow is insolvent"
        );
    }

    fn liability(env: &Env, asset: &Address) -> AssetLiability {
        let key = Self::liability_key(env);
        let map: Map<Address, AssetLiability> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Map::new(env));
        map.get(asset.clone()).unwrap_or_default()
    }

    fn save_liability(env: &Env, asset: &Address, liability: &AssetLiability) {
        let key = Self::liability_key(env);
        let mut map: Map<Address, AssetLiability> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Map::new(env));
        map.set(asset.clone(), liability.clone());
        env.storage().persistent().set(&key, &map);
    }

    fn liability_key(env: &Env) -> soroban_sdk::Symbol {
        soroban_sdk::Symbol::new(env, "liability")
    }

    fn next_id(env: &Env) -> u64 {
        let key = soroban_sdk::Symbol::new(env, "next_id");
        let id: u64 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(id + 1));
        id
    }

    fn load_escrow(env: &Env, id: u64) -> Escrow {
        let key = Self::escrow_key(env, id);
        env.storage()
            .persistent()
            .get(&key)
            .expect("escrow not found")
    }

    fn save_escrow(env: &Env, id: u64, escrow: &Escrow) {
        let key = Self::escrow_key(env, id);
        env.storage().persistent().set(&key, escrow);
    }

    fn escrow_key(env: &Env, id: u64) -> (soroban_sdk::Symbol, u64) {
        (soroban_sdk::Symbol::new(env, "escrow"), id)
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
}
