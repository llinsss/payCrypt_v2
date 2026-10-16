#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

/// Errors returned by the escrow contract.
///
/// `AssetMismatch` (code 4) is returned when a deposit or payout is attempted
/// with an asset contract address that does not match the asset bound to the
/// escrow at creation time. No state is mutated in that case.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AssetMismatch = 4,
    InvalidAmount = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub depositor: Address,
    pub beneficiary: Address,
    /// Asset contract address bound at creation; immutable for the escrow's lifetime.
    pub asset: Address,
    pub amount: i128,
    pub released: bool,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create an escrow, binding the asset contract address for its lifetime.
    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        asset: Address,
        amount: i128,
    ) -> Result<(), Error> {
        depositor.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if env.storage().instance().has(&DataKey::Escrow) {
            return Err(Error::AlreadyInitialized);
        }
        let escrow = Escrow {
            depositor,
            beneficiary,
            asset,
            amount,
            released: false,
        };
        env.storage().instance().set(&DataKey::Escrow, &escrow);
        Ok(())
    }

    /// Deposit funds into the escrow.
    ///
    /// `asset` must equal the asset bound at creation, otherwise
    /// `Error::AssetMismatch` is returned and no state is mutated.
    pub fn deposit(env: Env, asset: Address, amount: i128) -> Result<(), Error> {
        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&DataKey::Escrow)
            .ok_or(Error::NotInitialized)?;
        if asset != escrow.asset {
            return Err(Error::AssetMismatch);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        escrow.depositor.require_auth();
        let client = token::Client::new(&env, &escrow.asset);
        client.transfer(&escrow.depositor, &env.current_contract_address(), &amount);
        escrow.amount = amount;
        env.storage().instance().set(&DataKey::Escrow, &escrow);
        Ok(())
    }

    /// Release funds to the beneficiary.
    ///
    /// `asset` must equal the asset bound at creation, otherwise
    /// `Error::AssetMismatch` is returned and no state is mutated.
    pub fn payout(env: Env, asset: Address) -> Result<(), Error> {
        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&DataKey::Escrow)
            .ok_or(Error::NotInitialized)?;
        if asset != escrow.asset {
            return Err(Error::AssetMismatch);
        }
        if escrow.released {
            return Err(Error::Unauthorized);
        }
        escrow.depositor.require_auth();
        let client = token::Client::new(&env, &escrow.asset);
        client.transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );
        escrow.released = true;
        env.storage().instance().set(&DataKey::Escrow, &escrow);
        Ok(())
    }

    /// Read the escrow record, including the bound asset address.
    pub fn get_escrow(env: Env) -> Result<Escrow, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Escrow)
            .ok_or(Error::NotInitialized)
    }
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Escrow,
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, Env};

    fn setup() -> (Env, EscrowContractClient<'static>, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let asset_admin = Address::generate(&env);
        let asset_id = env.register_stellar_asset_contract(asset_admin.clone());
        (env, client, depositor, beneficiary, asset_id, asset_admin)
    }

    #[test]
    fn deposit_and_payout_with_correct_asset() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let sac = token::StellarAssetClient::new(&env, &asset_id);
        sac.mint(&depositor, &1000);
        client.create(&depositor, &beneficiary, &asset_id, &1000);
        client.deposit(&asset_id, &1000);
        client.payout(&asset_id);
        let token_client = token::Client::new(&env, &asset_id);
        assert_eq!(token_client.balance(&beneficiary), 1000);
    }

    #[test]
    fn deposit_rejects_mismatched_asset() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let other_admin = Address::generate(&env);
        let other_asset = env.register_stellar_asset_contract(other_admin);
        client.create(&depositor, &beneficiary, &asset_id, &1000);
        let res = client.try_deposit(&other_asset, &1000);
        assert_eq!(res, Err(Ok(Error::AssetMismatch)));
    }

    #[test]
    fn payout_rejects_mismatched_asset() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let other_admin = Address::generate(&env);
        let other_asset = env.register_stellar_asset_contract(other_admin);
        client.create(&depositor, &beneficiary, &asset_id, &1000);
        let res = client.try_payout(&other_asset);
        assert_eq!(res, Err(Ok(Error::AssetMismatch)));
    }

    #[test]
    fn deposit_rejects_zero_amount() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        client.create(&depositor, &beneficiary, &asset_id, &1000);
        let res = client.try_deposit(&asset_id, &0);
        assert_eq!(res, Err(Ok(Error::InvalidAmount)));
    }

    #[test]
    fn create_rejects_zero_amount() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let res = client.try_create(&depositor, &beneficiary, &asset_id, &0);
        assert_eq!(res, Err(Ok(Error::InvalidAmount)));
    }

    #[test]
    fn deposit_requires_depositor_auth() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        env.mock_auths(&[]);
        client.create(&depositor, &beneficiary, &asset_id, &1000);
        let res = client.try_deposit(&asset_id, &1000);
        assert!(res.is_err());
    }
}
