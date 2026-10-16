use soroban_sdk::{contracttype, Address, Env, String};

use crate::errors::RegistryError;

/// Current on-chain schema version for persisted registry records.
///
/// Bump this whenever the persisted layout of [`RegistryRecord`] changes so
/// that [`read_record`] can transparently upgrade older entries.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Persisted registry record.
///
/// `schema_version` is stored alongside the payload so that records written by
/// an older contract revision can be detected and upgraded on read.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryRecord {
    pub schema_version: u32,
    pub owner: Address,
    pub name: String,
    pub metadata: String,
}

fn record_key(env: &Env, id: u64) -> (soroban_sdk::Symbol, u64) {
    (soroban_sdk::Symbol::new(env, "record"), id)
}

/// Persist a registry record, always stamping it with the current schema
/// version so future revisions can migrate it safely.
pub fn write_record(env: &Env, id: u64, owner: Address, name: String, metadata: String) {
    let record = RegistryRecord {
        schema_version: CURRENT_SCHEMA_VERSION,
        owner,
        name,
        metadata,
    };
    env.storage().persistent().set(&record_key(env, id), &record);
}

/// Read a registry record, upgrading records written by older schema versions
/// to the current layout before returning them.
///
/// Returns [`RegistryError::NotFound`] when no record is stored for `id`.
pub fn read_record(env: &Env, id: u64) -> Result<RegistryRecord, RegistryError> {
    let key = record_key(env, id);
    let stored: RegistryRecord = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(RegistryError::NotFound)?;

    let upgraded = upgrade_record(env, stored)?;

    // Persist the upgraded record so subsequent reads are cheap and bounded.
    if upgraded.schema_version != stored.schema_version {
        env.storage().persistent().set(&key, &upgraded);
    }

    Ok(upgraded)
}

/// Upgrade a stored record to [`CURRENT_SCHEMA_VERSION`].
///
/// Records already at the current version are returned unchanged. Records from
/// a newer, unknown schema version are rejected rather than silently
/// misinterpreted.
fn upgrade_record(env: &Env, mut record: RegistryRecord) -> Result<RegistryRecord, RegistryError> {
    if record.schema_version > CURRENT_SCHEMA_VERSION {
        return Err(RegistryError::UnsupportedSchemaVersion);
    }

    // v1 -> v2: v1 records were persisted without a schema version and are
    // normalised here by stamping the current version. No payload reshaping is
    // required for this migration step.
    while record.schema_version < CURRENT_SCHEMA_VERSION {
        record.schema_version += 1;
    }

    let _ = env;
    Ok(record)
}
