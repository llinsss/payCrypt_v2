//! # Contract storage layout and schema versioning
//!
//! This module is the single source of truth for every persistent key used by
//! the contract and for the on-chain schema version that guards migrations.
//!
//! ## Persistent storage layout
//!
//! All persistent entries are addressed through [`DataKey`]. The enum is
//! `#[repr(u32)]` so the discriminant is stable across releases; new variants
//! MUST be appended (never reordered or removed) to keep existing keys valid.
//!
//! | Key (`DataKey`)        | Value type        | Description                                  |
//! |------------------------|-------------------|----------------------------------------------|
//! | `Admin`                | `Address`         | Contract administrator.                      |
//! | `Config`               | `Config`          | Protocol configuration (fees, limits).       |
//! | `TotalSupply`          | `i128`            | Total token supply.                          |
//! | `Balance(Address)`     | `i128`            | Per-account balance.                         |
//! | `Allowance(Address, Address)` | `i128`     | Spender allowance for an owner.              |
//! | `Escrow(u64)`          | `Escrow`          | Escrow record keyed by escrow id.            |
//! | `EscrowCount`          | `u64`             | Monotonic escrow id counter.                 |
//! | `Paused`               | `bool`            | Emergency pause flag.                        |
//! | `SchemaVersion`        | `u32`             | Persisted schema version (migration marker). |
//!
//! ## Migration policy
//!
//! [`CURRENT_SCHEMA_VERSION`] is the version this build writes and expects.
//! [`migrate`] is idempotent and MUST be invoked once during `initialize`/
//! upgrade before any other storage access. It refuses to run against a schema
//! newer than the binary understands, and upgrades older schemas in order.

use soroban_sdk::{contracttype, Address, Env};

/// Current on-chain schema version written by this build.
///
/// Bump this whenever the persistent layout changes and add a matching arm in
/// [`migrate`].
///
/// Version history:
/// - `1`: initial layout (`Admin`, `Config`, `TotalSupply`, `Balance`,
///   `Allowance`, `Escrow`, `EscrowCount`, `Paused`).
/// - `2`: adds the `SchemaVersion` marker and the `Paused` flag.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Every persistent storage key used by the contract.
///
/// Variants are append-only: the `#[repr(u32)]` discriminant is part of the
/// on-chain key, so reordering or removing a variant would orphan stored data.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DataKey {
    /// `Address`: contract administrator.
    Admin = 0,
    /// `Config`: protocol configuration.
    Config = 1,
    /// `i128`: total token supply.
    TotalSupply = 2,
    /// `i128`: balance for the given account.
    Balance(Address) = 3,
    /// `i128`: allowance granted by owner to spender.
    Allowance(Address, Address) = 4,
    /// `Escrow`: escrow record for the given id.
    Escrow(u64) = 5,
    /// `u64`: monotonic escrow id counter.
    EscrowCount = 6,
    /// `bool`: emergency pause flag.
    Paused = 7,
    /// `u32`: persisted schema version (migration marker).
    SchemaVersion = 8,
}

/// Reads the persisted schema version, defaulting to `1` for deployments that
/// predate the version marker.
pub fn schema_version(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::SchemaVersion)
        .unwrap_or(1)
}

/// Persists the schema version marker.
pub fn set_schema_version(env: &Env, version: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::SchemaVersion, &version);
}

/// Runs pending migrations and stamps the current schema version.
///
/// Idempotent: calling it on an up-to-date store is a no-op. Panics if the
/// stored schema is newer than [`CURRENT_SCHEMA_VERSION`], which indicates the
/// contract was upgraded against an incompatible binary.
pub fn migrate(env: &Env) {
    let stored = schema_version(env);

    if stored > CURRENT_SCHEMA_VERSION {
        panic!("storage schema is newer than this contract build");
    }

    if stored < 2 {
        // v1 -> v2: the `Paused` flag is introduced. Existing deployments
        // default to unpaused; the marker itself is written below.
        if !env.storage().persistent().has(&DataKey::Paused) {
            env.storage().persistent().set(&DataKey::Paused, &false);
        }
    }

    if stored < CURRENT_SCHEMA_VERSION {
        set_schema_version(env, CURRENT_SCHEMA_VERSION);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn migrate_from_populated_v1_preserves_data() {
        let env = Env::default();
        let admin = Address::generate(&env);

        // Simulate a populated prior (v1) schema: no version marker, no pause
        // flag, but real balances and escrow state already stored.
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::TotalSupply, &1_000i128);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(admin.clone()), &1_000i128);
        env.storage().persistent().set(&DataKey::EscrowCount, &3u64);

        assert_eq!(schema_version(&env), 1);

        migrate(&env);

        // Marker advanced and the new flag was backfilled.
        assert_eq!(schema_version(&env), CURRENT_SCHEMA_VERSION);
        assert_eq!(
            env.storage().persistent().get(&DataKey::Paused),
            Some(false)
        );

        // Pre-existing data is untouched.
        assert_eq!(
            env.storage().persistent().get(&DataKey::Admin),
            Some(admin.clone())
        );
        assert_eq!(
            env.storage().persistent().get(&DataKey::TotalSupply),
            Some(1_000i128)
        );
        assert_eq!(
            env.storage()
                .persistent()
                .get(&DataKey::Balance(admin)),
            Some(1_000i128)
        );
        assert_eq!(
            env.storage().persistent().get(&DataKey::EscrowCount),
            Some(3u64)
        );
    }

    #[test]
    fn migrate_is_idempotent() {
        let env = Env::default();

        migrate(&env);
        assert_eq!(schema_version(&env), CURRENT_SCHEMA_VERSION);

        // A second run must not change anything.
        migrate(&env);
        assert_eq!(schema_version(&env), CURRENT_SCHEMA_VERSION);
    }
}
