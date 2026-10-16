//! Registry contract: maps a stable identifier to a contract address and
//! tracks the schema version of persisted records so that records written by
//! older schemas can be safely read and upgraded.
//!
//! # Externally visible behavior
//!
//! The registry emits events for every state-changing operation so that
//! off-chain indexers can reconstruct the full registry state by replaying
//! the event log. The reconstruction invariant is:
//!
//! ```text
//! replay(events) == contract storage
//! ```
//!
//! Event topics and payloads:
//! - `register`  -> (name, owner, wallet)
//! - `transfer`  -> (name, from, to, wallet)
//! - `associate` -> (name, wallet)
//!
//! # Atomicity
//!
//! `transfer` updates the owner and the associated wallet together. The
//! wallet is carried over to the new owner in the same storage write, so a
//! transfer can never leave the owner and wallet out of sync. If validation
//! or storage fails, neither the owner nor the wallet is updated.
//!
//! # Error codes
//! - `TagNotFound` (1): the referenced tag id does not exist.
//! - `Unauthorized` (2): caller is not authorized to perform the operation.
//! - `TagReleased` (3): the tag id has been released and cannot be reused.
//! - `TagInactive` (4): the tag is already inactive/released.
//! - `VersionOverflow` (5): the schema version counter would overflow.

#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol, Vec};

/// Storage keys used by the registry contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Monotonic counter used to allocate tag ids.
    NextTagId,
    /// A tag record keyed by its id.
    Tag(u64),
    /// Set of tag ids currently owned by a wallet.
    WalletTags(Address),
    /// Tombstone marker preventing reuse of a released tag id.
    Released(u64),
    /// Schema version of the persisted registry state.
    SchemaVersion,
}

/// Current persisted registry schema version.
///
/// Bump this whenever the on-chain storage layout changes so that upgrade
/// compatibility can be asserted against state written by prior versions.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Highest schema version the registry can represent.
///
/// The version counter is a `u32`; once a record reaches this value the
/// counter cannot be advanced further without wrapping to a stale version.
pub const MAX_SCHEMA_VERSION: u32 = u32::MAX;

/// A registry tag binding a human readable name to an owning wallet.
#[contracttype]
#[derive(Clone)]
pub struct Tag {
    pub id: u64,
    pub name: String,
    pub owner: Address,
    pub active: bool,
}

/// Persisted registry entry.
///
/// `schema_version` is stored alongside the payload so that records created
/// by an earlier schema can be detected and upgraded on read.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryRecord {
    pub schema_version: u32,
    pub address: Address,
}

/// Legacy record layout used before schema versioning was introduced.
///
/// Records written by the current (pre-versioning) schema are stored without
/// a version field; this type lets the read path decode them and upgrade them
/// to the latest [`RegistryRecord`] layout.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyRegistryRecord {
    pub address: Address,
}

/// Error codes returned by the registry contract.
#[contracterror]
#[repr(u32)]
pub enum RegistryError {
    /// The referenced tag id does not exist.
    TagNotFound = 1,
    /// The caller is not authorized to perform the operation.
    Unauthorized = 2,
    /// The tag id has been released and cannot be reused.
    TagReleased = 3,
    /// The tag is already inactive/released.
    TagInactive = 4,
    /// The schema version counter would overflow.
    VersionOverflow = 5,
}

const REGISTRY: Symbol = symbol_short!("REGISTRY");

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    /// Store `address` under `id`, tagging the record with the current schema
    /// version. Only the `admin` may write.
    pub fn set(env: Env, admin: Address, id: Symbol, address: Address) -> Result<(), RegistryError> {
        admin.require_auth();

        let record = RegistryRecord {
            schema_version: CURRENT_SCHEMA_VERSION,
            address,
        };
        env.storage().persistent().set(&id, &record);
        Ok(())
    }

    /// Read the record stored under `id`, upgrading records written by an
    /// older schema to the latest layout before returning them.
    ///
    /// Returns [`RegistryError::NotFound`] when no record exists.
    pub fn get(env: Env, id: Symbol) -> Result<RegistryRecord, RegistryError> {
        let record = Self::read_and_migrate(&env, &id)?;
        Ok(record)
    }

    /// Read the record stored under `id` and, if it was written by an older
    /// schema, persist the upgraded record back to storage.
    ///
    /// This is the safe read/upgrade path: it detects the stored schema
    /// version, upgrades records created by the current schema, and writes
    /// the migrated record back so subsequent reads are cheap.
    ///
    /// Returns [`RegistryError::VersionOverflow`] when the stored record is
    /// already at [`MAX_SCHEMA_VERSION`] and cannot be advanced further.
    pub fn migrate(env: Env, id: Symbol) -> Result<RegistryRecord, RegistryError> {
        let record = Self::read_and_migrate(&env, &id)?;
        env.storage().persistent().set(&id, &record);
        Ok(record)
    }

    /// Advance the schema version of the record stored under `id` by one.
    ///
    /// Only the `admin` may write. Returns [`RegistryError::VersionOverflow`]
    /// when the record is already at [`MAX_SCHEMA_VERSION`], rather than
    /// wrapping the counter to a stale version.
    pub fn bump_version(
        env: Env,
        admin: Address,
        id: Symbol,
    ) -> Result<RegistryRecord, RegistryError> {
        admin.require_auth();

        let mut record = Self::read_and_migrate(&env, &id)?;
        record.schema_version = Self::next_schema_version(record.schema_version)?;
        env.storage().persistent().set(&id, &record);
        Ok(record)
    }

    /// Compute the next schema version, rejecting exhaustion explicitly.
    ///
    /// Returns [`RegistryError::VersionOverflow`] instead of wrapping or
    /// saturating so callers never observe a stale version.
    fn next_schema_version(current: u32) -> Result<u32, RegistryError> {
        if current >= MAX_SCHEMA_VERSION {
            return Err(RegistryError::VersionOverflow);
        }
        Ok(current + 1)
    }

    /// Internal read path shared by `get` and `migrate`.
    ///
    /// Attempts to decode the latest [`RegistryRecord`] layout first. If that
    /// fails, falls back to the legacy layout and upgrades it in memory.
    fn read_and_migrate(env: &Env, id: &Symbol) -> Result<RegistryRecord, RegistryError> {
        if let Some(record) = env.storage().persistent().get::<Symbol, RegistryRecord>(id) {
            if record.schema_version == CURRENT_SCHEMA_VERSION {
                return Ok(record);
            }
            // A versioned record written by a future/unknown schema cannot be
            // safely downgraded; surface it as not found rather than guessing.
            return Err(RegistryError::NotFound);
        }

        // Fall back to the legacy (pre-versioning) layout and upgrade it.
        if let Some(legacy) = env
            .storage()
            .persistent()
            .get::<Symbol, LegacyRegistryRecord>(id)
        {
            return Ok(RegistryRecord {
                schema_version: CURRENT_SCHEMA_VERSION,
                address: legacy.address,
            });
        }

        Err(RegistryError::NotFound)
    }
}
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Events}, Env};

    fn setup() -> (Env, RegistryContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &id);
        (env, client)
    }

    /// Reconstruct registry state purely from emitted events and compare it
    /// against contract storage. This is the core replay invariant test.
    #[test]
    fn replay_reconstructs_storage() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");

        client.register(&name, &alice, &alice);
        client.transfer(&name, &bob);
        client.associate(&name, &carol);

        // Rebuild state from the event log only.
        let mut replayed: Option<Registration> = None;
        for event in env.events().all().iter() {
            let (topics, data) = event;
            let topic0: Symbol = topics.get(0).unwrap().try_into().unwrap();
            if topic0 == symbol_short!("register") {
                let (owner, wallet): (Address, Address) = data.try_into().unwrap();
                replayed = Some(Registration { owner, wallet });
            } else if topic0 == symbol_short!("transfer") {
                let (_from, to, wallet): (Address, Address, Address) = data.try_into().unwrap();
                let reg = replayed.as_mut().unwrap();
                reg.owner = to;
                reg.wallet = wallet;
            } else if topic0 == symbol_short!("associate") {
                let wallet: Address = data.try_into().unwrap();
                replayed.as_mut().unwrap().wallet = wallet;
            }
        }

        assert_eq!(replayed, client.get(&name));
        assert_eq!(replayed.unwrap().owner, bob);
        assert_eq!(replayed.unwrap().wallet, carol);
    }

    #[test]
    fn register_emits_event_and_stores() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");
        client.register(&name, &alice, &alice);
        assert_eq!(client.get(&name).unwrap().owner, alice);
        assert_eq!(env.events().all().len(), 1);
    }

    #[test]
    fn duplicate_register_fails() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");
        client.register(&name, &alice, &alice);
        assert_eq!(client.try_register(&name, &alice, &alice), Err(Ok(RegistryError::AlreadyRegistered)));
    }

    #[test]
    fn transfer_requires_owner_auth() {
        let env = Env::default();
        let id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");
        env.mock_all_auths();
        client.register(&name, &alice, &alice);
        // Without mocked auth for bob, transfer must fail authorization.
        env.set_auths(&[]);
        assert!(client.try_transfer(&name, &bob).is_err());
    }

    #[test]
    fn transfer_unknown_name_fails() {
        let (env, client) = setup();
        let bob = Address::generate(&env);
        let name = String::from_str(&env, "missing.xlm");
        assert_eq!(client.try_transfer(&name, &bob), Err(Ok(RegistryError::NotFound)));
    }

    #[test]
    fn associate_unknown_name_fails() {
        let (env, client) = setup();
        let wallet = Address::generate(&env);
        let name = String::from_str(&env, "missing.xlm");
        assert_eq!(client.try_associate(&name, &wallet), Err(Ok(RegistryError::NotFound)));
    }

    /// Transfer carries the associated wallet over to the new owner in the
    /// same write, so owner and wallet stay consistent.
    #[test]
    fn transfer_carries_wallet_atomically() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let wallet = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");

        client.register(&name, &alice, &wallet);
        client.transfer(&name, &bob);

        let reg = client.get(&name).unwrap();
        assert_eq!(reg.owner, bob);
        assert_eq!(reg.wallet, wallet);
    }

    /// A failed transfer (unknown name) must not mutate any stored state.
    #[test]
    fn failed_transfer_leaves_state_unchanged() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let wallet = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");

        client.register(&name, &alice, &wallet);
        let before = client.get(&name).unwrap();

        let missing = String::from_str(&env, "missing.xlm");
        assert_eq!(client.try_transfer(&missing, &bob), Err(Ok(RegistryError::NotFound)));

        // Original registration is untouched: owner and wallet both intact.
        assert_eq!(client.get(&name).unwrap(), before);
        assert_eq!(client.get(&name).unwrap().owner, alice);
        assert_eq!(client.get(&name).unwrap().wallet, wallet);
    }

    #[test]
    fn set_and_get_roundtrip() {
        let (env, client, admin) = setup();
        let id = Symbol::new(&env, "token");
        let address = Address::generate(&env);

        client.set(&admin, &id, &address);
        let record = client.get(&id);

        assert_eq!(record.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(record.address, address);
    }

    #[test]
    fn get_missing_returns_not_found() {
        let (env, client, _admin) = setup();
        let id = Symbol::new(&env, "missing");
        assert_eq!(client.try_get(&id), Err(Ok(RegistryError::NotFound)));
    }

    #[test]
    fn set_requires_admin_auth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let id = Symbol::new(&env, "token");
        let address = Address::generate(&env);

        // No auth mocked: the write must fail authorization.
        assert!(client.try_set(&admin, &id, &address).is_err());
    }

    #[test]
    fn migrates_legacy_record_on_read() {
        let (env, client, _admin) = setup();
        let id = Symbol::new(&env, "legacy");
        let address = Address::generate(&env);

        // Simulate a record written by the pre-versioning schema.
        env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .set(&id, &LegacyRegistryRecord { address: address.clone() });
        });

        let record = client.get(&id);
        assert_eq!(record.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(record.address, address);
    }

    #[test]
    fn migrate_persists_upgraded_record() {
        let (env, client, _admin) = setup();
        let id = Symbol::new(&env, "legacy");
        let address = Address::generate(&env);

        env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .set(&id, &LegacyRegistryRecord { address: address.clone() });
        });

        let migrated = client.migrate(&id);
        assert_eq!(migrated.schema_version, CURRENT_SCHEMA_VERSION);

        // The upgraded record is now stored in the latest layout.
        let stored: RegistryRecord = env.as_contract(&client.address, || {
            env.storage().persistent().get(&id).unwrap()
        });
        assert_eq!(stored.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(stored.address, address);
    }

    #[test]
    fn migrate_missing_returns_not_found() {
        let (env, client, _admin) = setup();
        let id = Symbol::new(&env, "missing");
        assert_eq!(client.try_migrate(&id), Err(Ok(RegistryError::NotFound)));
    }

    #[test]
    fn bump_version_advances_counter() {
        let (env, client, admin) = setup();
        let id = Symbol::new(&env, "token");
        let address = Address::generate(&env);

        client.set(&admin, &id, &address);
        let bumped = client.bump_version(&admin, &id);

        assert_eq!(bumped.schema_version, CURRENT_SCHEMA_VERSION + 1);
        assert_eq!(bumped.address, address);
    }

    #[test]
    fn bump_version_requires_admin_auth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let id = Symbol::new(&env, "token");
        let address = Address::generate(&env);

        // No auth mocked: the version bump must fail authorization.
        assert!(client.try_bump_version(&admin, &id).is_err());
    }

    #[test]
    fn bump_version_at_max_returns_overflow() {
        let (env, client, admin) = setup();
        let id = Symbol::new(&env, "token");
        let address = Address::generate(&env);

        // Seed a record already at the maximum representable version.
        env.as_contract(&client.address, || {
            env.storage().persistent().set(
                &id,
                &RegistryRecord {
                    schema_version: MAX_SCHEMA_VERSION,
                    address: address.clone(),
                },
            );
        });

        assert_eq!(
            client.try_bump_version(&admin, &id),
            Err(Ok(RegistryError::VersionOverflow))
        );

        // The stored version must not wrap to a stale value.
        let stored: RegistryRecord = env.as_contract(&client.address, || {
            env.storage().persistent().get(&id).unwrap()
        });
        assert_eq!(stored.schema_version, MAX_SCHEMA_VERSION);
    }

    #[test]
    fn next_schema_version_boundary() {
        assert_eq!(next_schema_version(0), Ok(1));
        assert_eq!(next_schema_version(MAX_SCHEMA_VERSION - 1), Ok(MAX_SCHEMA_VERSION));
        assert_eq!(
            next_schema_version(MAX_SCHEMA_VERSION),
            Err(RegistryError::VersionOverflow)
        );
    }

    #[test]
    fn release_clears_wallet_association() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        assert_eq!(client.tags_of(&owner).len(), 1);

        client.release(&owner, &id);

        assert_eq!(client.tags_of(&owner).len(), 0);
        let tag = client.get_tag(&id).unwrap();
        assert!(!tag.active);
    }

    #[test]
    fn release_requires_owner_auth() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        let stranger = Address::generate(&env);

        let result = client.try_release(&stranger, &id);
        assert_eq!(result, Err(Ok(RegistryError::Unauthorized)));
    }

    #[test]
    fn released_id_cannot_be_reused() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        client.release(&owner, &id);

        let result = client.try_release(&owner, &id);
        assert_eq!(result, Err(Ok(RegistryError::TagReleased)));
    }

    #[test]
    fn release_unknown_tag_fails() {
        let (_env, client, owner) = setup();
        let result = client.try_release(&owner, &999);
        assert_eq!(result, Err(Ok(RegistryError::TagNotFound)));
    }

    #[test]
    fn legacy_state_reports_zero_schema_version() {
        let (_env, client, _owner) = setup();
        // State written before the schema version key existed reports 0.
        assert_eq!(client.schema_version(), 0);
    }

    #[test]
    fn upgrade_preserves_owner_wallet_and_version() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));

        // Simulate an upgrade: the next implementation stamps the schema version
        // and must still read the state written by the current schema.
        let version = client.set_schema_version();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert_eq!(client.schema_version(), CURRENT_SCHEMA_VERSION);

        // Owner and wallet association survive the upgrade.
        let tag = client.get_tag(&id).unwrap();
        assert_eq!(tag.owner, owner);
        assert!(tag.active);
        assert_eq!(client.tags_of(&owner).len(), 1);
        assert_eq!(client.tags_of(&owner).get(0).unwrap(), id);
    }

    #[test]
    fn upgrade_preserves_released_tombstone() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        client.release(&owner, &id);

        client.set_schema_version();

        // Released state and tombstone remain intact after the upgrade.
        let tag = client.get_tag(&id).unwrap();
        assert!(!tag.active);
        assert_eq!(client.tags_of(&owner).len(), 0);
        let result = client.try_release(&owner, &id);
        assert_eq!(result, Err(Ok(RegistryError::TagReleased)));
    }

    #[test]
    fn set_schema_version_is_idempotent() {
        let (_env, client, _owner) = setup();
        assert_eq!(client.set_schema_version(), CURRENT_SCHEMA_VERSION);
        assert_eq!(client.set_schema_version(), CURRENT_SCHEMA_VERSION);
        assert_eq!(client.schema_version(), CURRENT_SCHEMA_VERSION);
    }

    // Fall back to the legacy (pre-versioning) layout and upgrade it.
    if let Some(legacy) = env
        .storage()
        .persistent()
        .get::<Symbol, LegacyRegistryRecord>(id)
    {
        return Ok(RegistryRecord {
            schema_version: CURRENT_SCHEMA_VERSION,
            address: legacy.address,
        });
    }

    Err(RegistryError::NotFound)
}

    }
}
