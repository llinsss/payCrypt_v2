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
#[derive(Clone)]
pub struct Escrow {
    pub depositor: Address,
    pub beneficiary: Address,
    pub asset: Address,
    pub amount: i128,
    pub settled: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct EscrowError;

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create an escrow, pulling `amount` of `asset` from `depositor` into the
    /// contract and recording it as an accounted liability for the beneficiary.
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

        escrow.settled = true;
        Self::save_escrow(&env, id, &escrow);

        let mut liability = Self::liability(&env, &escrow.asset);
        liability.pending -= escrow.amount;
        liability.accounted -= escrow.amount;
        Self::save_liability(&env, &escrow.asset, &liability);

        Self::assert_solvent(&env, &escrow.asset);
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
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, Env};

    fn setup() -> (Env, EscrowContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let asset = env.register_stellar_asset_contract(depositor.clone());
        (env, client, depositor, beneficiary, asset)
    }

    fn mint(env: &Env, asset: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, asset).mint(to, &amount);
    }

    #[test]
    fn create_and_settle_preserve_solvency() {
        let (env, client, depositor, beneficiary, asset) = setup();
        mint(&env, &asset, &depositor, 1_000);

        let id = client.create(&depositor, &beneficiary, &asset, &400);
        assert!(client.is_solvent(&asset));
        let l = client.liability(&asset);
        assert_eq!(l.pending, 400);
        assert_eq!(l.accounted, 400);

        client.settle(&id);
        assert!(client.is_solvent(&asset));
        let l = client.liability(&asset);
        assert_eq!(l.pending, 0);
        assert_eq!(l.accounted, 0);
    }

    #[test]
    fn sequence_of_creates_and_settles_stays_solvent() {
        let (env, client, depositor, beneficiary, asset) = setup();
        mint(&env, &asset, &depositor, 10_000);

        let a = client.create(&depositor, &beneficiary, &asset, &300);
        let b = client.create(&depositor, &beneficiary, &asset, &700);
        assert!(client.is_solvent(&asset));
        assert_eq!(client.liability(&asset).pending, 1_000);

        client.settle(&a);
        assert!(client.is_solvent(&asset));
        assert_eq!(client.liability(&asset).pending, 700);

        client.settle(&b);
        assert!(client.is_solvent(&asset));
        assert_eq!(client.liability(&asset).pending, 0);
    }

    #[test]
    fn unsolicited_transfer_is_not_counted_as_backing() {
        let (env, client, depositor, beneficiary, asset) = setup();
        mint(&env, &asset, &depositor, 1_000);

        let id = client.create(&depositor, &beneficiary, &asset, &500);
        assert_eq!(client.liability(&asset).accounted, 500);

        // Unsolicited transfer directly to the contract.
        let contract_id = client.address.clone();
        token::Client::new(&env, &asset).transfer(&depositor, &contract_id, &250);

        // Surplus is not backing until explicitly accounted for.
        assert_eq!(client.liability(&asset).accounted, 500);
        assert!(client.is_solvent(&asset));

        client.account_surplus(&asset);
        assert_eq!(client.liability(&asset).accounted, 750);
        assert!(client.is_solvent(&asset));

        client.settle(&id);
        assert!(client.is_solvent(&asset));
    }
}
