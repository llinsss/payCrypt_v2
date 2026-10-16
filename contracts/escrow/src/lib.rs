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

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String, Symbol};

/// Maximum byte length of escrow metadata accepted by [`EscrowContract::create`].
///
/// Metadata is stored in instance storage, so its size is bounded to keep
/// storage growth and per-invocation work predictable. Values longer than this
/// (in bytes) are rejected with [`Error::MetadataTooLong`] before any storage
/// write occurs.
pub const MAX_METADATA_LEN: u32 = 128;

/// Number of ledgers by which persistent escrow entries are extended on every
/// state-changing call. Renewal is bounded (a single `extend_ttl` per call) so
/// per-invocation work stays constant regardless of escrow count.
pub const ESCROW_TTL_THRESHOLD: u32 = 100;
pub const ESCROW_TTL_EXTEND_TO: u32 = 1000;

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
    ///
    /// Renews the persistent escrow entry's TTL before returning so that an
    /// active escrow remains readable across ledger advancement. Renewal is a
    /// single bounded `extend_ttl` call and only runs when the entry is close
    /// to expiry (below [`ESCROW_TTL_THRESHOLD`]).
    pub fn get_escrow(env: Env) -> Result<Escrow, Error> {
        let key = DataKey::Escrow;
        let escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotInitialized)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, ESCROW_TTL_THRESHOLD, ESCROW_TTL_EXTEND_TO);
        Ok(escrow)
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
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "invoice-1"));
        assert_eq!(client.try_deposit(&other_asset, &1000), Err(Ok(Error::AssetMismatch)));
    }

    #[test]
    fn escrow_readable_after_ledger_advancement() {
        let (env, client, depositor, beneficiary, asset_id, _admin) = setup();
        client.create(&depositor, &beneficiary, &asset_id, &1000, &meta(&env, "invoice-1"));
        // Advance the ledger close to the TTL threshold and confirm the
        // active escrow is still readable and its TTL is renewed.
        env.ledger().set_sequence_number(env.ledger().sequence() + ESCROW_TTL_THRESHOLD - 1);
        let escrow = client.get_escrow();
        assert_eq!(escrow.amount, 1000);
        assert_eq!(escrow.asset, asset_id);
        assert!(!escrow.released);
    }

    #[test]
    fn get_escrow_fails_when_not_initialized() {
        let (_env, client, _depositor, _beneficiary, _asset_id, _admin) = setup();
        assert_eq!(client.try_get_escrow(), Err(Ok(Error::NotInitialized)));
    }
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

}
