#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, String};

/// Maximum byte length of escrow metadata accepted by [`EscrowContract::create`].
///
/// Metadata is stored in instance storage, so its size is bounded to keep
/// storage growth and per-invocation work predictable. Values longer than this
/// (in bytes) are rejected with [`Error::MetadataTooLong`] before any storage
/// write occurs.
pub const MAX_METADATA_LEN: u32 = 128;

/// Errors returned by the escrow contract.
///
/// `AssetMismatch` (code 4) is returned when a deposit or payout is attempted
/// with an asset contract address that does not match the asset bound to the
/// escrow at creation time. No state is mutated in that case.
///
/// `MetadataTooLong` (code 6) is returned when the supplied metadata exceeds
/// [`MAX_METADATA_LEN`] bytes. `MetadataInvalidChar` (code 7) is returned when
/// the metadata contains a byte outside the supported character policy (see
/// [`is_supported_metadata`]). Neither case mutates state.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AssetMismatch = 4,
    InvalidAmount = 5,
    MetadataTooLong = 6,
    MetadataInvalidChar = 7,
}

/// Supported character policy for escrow metadata: printable ASCII only
/// (bytes `0x20..=0x7E`). This keeps metadata human-readable and avoids
/// ambiguous or control characters in stored records.
fn is_supported_metadata(metadata: &String) -> bool {
    let len = metadata.len();
    let mut buf = [0u8; MAX_METADATA_LEN as usize];
    metadata.copy_into_slice(&mut buf[..len as usize]);
    buf[..len as usize]
        .iter()
        .all(|b| (0x20..=0x7E).contains(b))
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
    /// Optional human-readable metadata, bounded by [`MAX_METADATA_LEN`].
    pub metadata: String,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create an escrow, binding the asset contract address for its lifetime.
    ///
    /// `metadata` must be at most [`MAX_METADATA_LEN`] bytes and contain only
    /// printable ASCII characters; otherwise `Error::MetadataTooLong` or
    /// `Error::MetadataInvalidChar` is returned and no state is written.
    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        asset: Address,
        amount: i128,
        metadata: String,
    ) -> Result<(), Error> {
        depositor.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if metadata.len() > MAX_METADATA_LEN {
            return Err(Error::MetadataTooLong);
        }
        if !is_supported_metadata(&metadata) {
            return Err(Error::MetadataInvalidChar);
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
            metadata,
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
    ///
    /// Reentrancy safety: the `released` flag is persisted *before* the
    /// external token transfer is invoked. If the token contract re-enters
    /// `payout` (or any other entry point) during the callback, the escrow is
    /// already marked released and the re-entrant call fails with
    /// `Error::Unauthorized` without moving funds a second time. If the
    /// transfer itself fails, the whole invocation is rolled back atomically
    /// by the host, restoring the pre-call state.
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
        // Finalize state before the external call so a re-entrant callback
        // observes `released == true` and cannot double-spend the escrow.
        escrow.released = true;
        env.storage().instance().set(&DataKey::Escrow, &escrow);
        let client = token::Client::new(&env, &escrow.asset);
        client.transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );
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
    use soroban_sdk::{token, Env, String};

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

    fn meta(env: &Env, s: &str) -> String {
        String::from_str(env, s)
    }

    #[test]
    fn deposit_and_payout_with_correct_asset() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let sac = token::StellarAssetClient::new(&env, &asset_id);
        sac.mint(&depositor, &1000);
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "invoice-1"));
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
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "m"));
        let res = client.try_deposit(&other_asset, &1000);
        assert_eq!(res, Err(Ok(Error::AssetMismatch)));
    }

    #[test]
    fn payout_rejects_mismatched_asset() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let other_admin = Address::generate(&env);
        let other_asset = env.register_stellar_asset_contract(other_admin);
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "m"));
        let res = client.try_payout(&other_asset);
        assert_eq!(res, Err(Ok(Error::AssetMismatch)));
    }

    #[test]
    fn payout_twice_is_rejected_and_funds_move_once() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let sac = token::StellarAssetClient::new(&env, &asset_id);
        sac.mint(&depositor, &1000);
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "m"));
        client.deposit(&asset_id, &1000);
        client.payout(&asset_id);
        // Repeated entry path: a second payout must not move funds again.
        let res = client.try_payout(&asset_id);
        assert_eq!(res, Err(Ok(Error::Unauthorized)));
        let token_client = token::Client::new(&env, &asset_id);
        assert_eq!(token_client.balance(&beneficiary), 1000);
        assert_eq!(token_client.balance(&client.address), 0);
    }

    #[test]
    fn payout_state_finalized_before_transfer() {
        // The `released` flag is persisted before the external token transfer,
        // so a re-entrant callback observes the finalized state. We assert the
        // observable consequence: after payout the escrow is released and a
        // re-entrant payout attempt is rejected without moving funds.
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let sac = token::StellarAssetClient::new(&env, &asset_id);
        sac.mint(&depositor, &500);
        client.create(&depositor, &beneficiary, &asset_id, &500, &meta(&env, "m"));
        client.deposit(&asset_id, &500);
        client.payout(&asset_id);
        let escrow = client.get_escrow();
        assert!(escrow.released);
        let res = client.try_payout(&asset_id);
        assert_eq!(res, Err(Ok(Error::Unauthorized)));
        let token_client = token::Client::new(&env, &asset_id);
        assert_eq!(token_client.balance(&beneficiary), 500);
    }

    #[test]
    fn payout_failure_rolls_back_atomically() {
        // If the external transfer fails (insufficient contract balance), the
        // whole invocation is rolled back: the escrow must remain unreleased
        // and no funds move.
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let sac = token::StellarAssetClient::new(&env, &asset_id);
        sac.mint(&depositor, &1000);
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "m"));
        // Deposit a smaller amount than the escrow amount so the payout
        // transfer cannot be satisfied by the contract balance.
        client.deposit(&asset_id, &100);
        let res = client.try_payout(&asset_id);
        assert!(res.is_err());
        let escrow = client.get_escrow();
        assert!(!escrow.released);
        let token_client = token::Client::new(&env, &asset_id);
        assert_eq!(token_client.balance(&beneficiary), 0);
    }

    #[test]
    fn payout_requires_depositor_auth() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        let sac = token::StellarAssetClient::new(&env, &asset_id);
        sac.mint(&depositor, &1000);
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "m"));
        client.deposit(&asset_id, &1000);
        // Drop the blanket auth mock so the missing depositor auth is enforced.
        env.set_auths(&[]);
        let res = client.try_payout(&asset_id);
        assert!(res.is_err());
        let escrow = client.get_escrow();
        assert!(!escrow.released);
    }
}
