//! Registry contract: maps a stable identifier to a contract address and
//! tracks the schema version of persisted records so that records written by
//! older schemas can be safely read and upgraded.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

/// Current schema version for persisted [`RegistryRecord`] entries.
///
/// Bump this whenever the on-chain record layout changes so that the read
/// path can detect and migrate records written by an older schema.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Highest schema version the registry can represent.
///
/// The version counter is a `u32`; once a record reaches this value the
/// counter cannot be advanced further without wrapping to a stale version.
pub const MAX_SCHEMA_VERSION: u32 = u32::MAX;

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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RegistryError {
    NotFound = 1,
    Unauthorized = 2,
    VersionOverflow = 3,
}

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

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, RegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        (env, client, admin)
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
}
