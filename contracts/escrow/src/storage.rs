//! Escrow storage key layout and TTL management.
//!
//! # Key layout
//!
//! All escrow state lives under a single [`DataKey`] enum so that keys are
//! deterministic, collision-free, and easy to reason about across upgrades.
//! The layout is:
//!
//! | Key                        | Storage    | Value                     |
//! |----------------------------|------------|---------------------------|
//! | `DataKey::Escrow(id)`      | persistent | [`EscrowState`]           |
//! | `DataKey::EscrowCount`     | instance   | `u32` (next escrow id)    |
//! | `DataKey::Admin`           | instance   | `Address`                 |
//! | `DataKey::Token`           | instance   | `Address` (asset binding) |
//!
//! Persistent entries are the only ones that can expire, so TTL renewal is
//! applied to `DataKey::Escrow(id)` whenever an active escrow is touched.

use soroban_sdk::{contracttype, Address, Env};

/// Number of ledgers added to a persistent entry's TTL on renewal.
///
/// Chosen to comfortably exceed the default minimum while keeping the
/// per-invocation cost of `extend_ttl` bounded and predictable.
pub const ESCROW_TTL_LEDGERS: u32 = 100_000;

/// Threshold below which a persistent entry is considered "near expiry" and
/// must be renewed. Renewal only happens when the remaining TTL drops below
/// this value, so repeated calls do not grow storage unboundedly.
pub const ESCROW_TTL_THRESHOLD: u32 = 50_000;

/// Deterministic storage keys for the escrow contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Per-escrow persistent state, keyed by escrow id.
    Escrow(u32),
    /// Monotonic counter used to allocate the next escrow id (instance).
    EscrowCount,
    /// Contract admin address (instance).
    Admin,
    /// Bound asset/token address (instance).
    Token,
}

/// Renew the TTL of a persistent escrow entry if it is near expiry.
///
/// This is a no-op when the entry still has more than
/// [`ESCROW_TTL_THRESHOLD`] ledgers remaining, which keeps per-invocation
/// work bounded and avoids unnecessary storage writes.
///
/// Returns `true` if the TTL was extended, `false` otherwise.
pub fn renew_escrow_ttl(env: &Env, id: u32) -> bool {
    let key = DataKey::Escrow(id);
    if !env.storage().persistent().has(&key) {
        return false;
    }
    env.storage().persistent().extend_ttl(
        &key,
        ESCROW_TTL_THRESHOLD,
        ESCROW_TTL_LEDGERS,
    );
    true
}

/// Read an escrow entry, renewing its TTL first so that active escrow state
/// remains readable after ledger advancement.
pub fn get_escrow<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
    env: &Env,
    id: u32,
) -> Option<T> {
    renew_escrow_ttl(env, id);
    env.storage().persistent().get(&DataKey::Escrow(id))
}

/// Persist an escrow entry and (re)arm its TTL.
pub fn set_escrow<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    env: &Env,
    id: u32,
    value: &T,
) {
    let key = DataKey::Escrow(id);
    env.storage().persistent().set(&key, value);
    env.storage().persistent().extend_ttl(
        &key,
        ESCROW_TTL_THRESHOLD,
        ESCROW_TTL_LEDGERS,
    );
}

/// Remove an escrow entry from persistent storage.
pub fn remove_escrow(env: &Env, id: u32) {
    env.storage().persistent().remove(&DataKey::Escrow(id));
}

/// Read the next escrow id counter from instance storage.
pub fn get_escrow_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::EscrowCount)
        .unwrap_or(0)
}

/// Store the next escrow id counter in instance storage.
pub fn set_escrow_count(env: &Env, count: u32) {
    env.storage().instance().set(&DataKey::EscrowCount, &count);
}

/// Read the bound asset/token address, if any.
pub fn get_token(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Token)
}

/// Bind the asset/token address for this contract instance.
pub fn set_token(env: &Env, token: &Address) {
    env.storage().instance().set(&DataKey::Token, token);
}

/// Read the contract admin address, if any.
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

/// Store the contract admin address.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}
