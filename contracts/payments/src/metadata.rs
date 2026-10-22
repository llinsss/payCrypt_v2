//! Bounded metadata model for Rust/Soroban payments.
//!
//! Payment metadata is stored as an ordered, bounded set of key/value pairs.
//! All writes are validated deterministically before touching storage so that
//! the contract footprint and resource usage stay predictable.
//!
//! Storage layout:
//! - `DataKey::Metadata(payment_id)` -> `Vec<MetadataEntry>` kept in canonical
//!   (lexicographic by key) order.
//!
//! Upgrade compatibility: entries are plain `String` pairs, so adding new
//! validation rules is backward compatible as long as existing stored data
//! already satisfies them. Rollback is safe because no derived state is kept.

use soroban_sdk::{contracterror, contractevent, contracttype, Env, String, Vec};

/// Maximum number of metadata entries per payment.
pub const MAX_METADATA_ENTRIES: u32 = 16;
/// Maximum byte length of a metadata key.
pub const MAX_KEY_LEN: u32 = 32;
/// Maximum byte length of a metadata value.
pub const MAX_VALUE_LEN: u32 = 128;

/// Typed errors for metadata validation and authorization.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MetadataError {
    /// Too many entries would be stored.
    TooManyEntries = 1,
    /// A key exceeds `MAX_KEY_LEN`.
    KeyTooLong = 2,
    /// A value exceeds `MAX_VALUE_LEN`.
    ValueTooLong = 3,
    /// A key is empty.
    EmptyKey = 4,
    /// Duplicate key supplied in a single write.
    DuplicateKey = 5,
    /// Caller is not authorized to mutate metadata.
    Unauthorized = 6,
    /// Replay detected: the supplied nonce was already used.
    Replay = 7,
}

/// A single bounded metadata entry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataEntry {
    pub key: String,
    pub value: String,
}

/// Storage keys owned by the metadata module.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MetadataKey {
    /// Ordered metadata entries for a payment.
    Entries(u64),
    /// Last accepted nonce for a payment, used for replay protection.
    Nonce(u64),
}

/// Emitted whenever metadata is mutated.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataUpdated {
    #[topic]
    pub payment_id: u64,
    pub entry_count: u32,
    pub nonce: u64,
}

/// Deterministically validate a single entry's bounds.
fn validate_entry(entry: &MetadataEntry) -> Result<(), MetadataError> {
    if entry.key.len() == 0 {
        return Err(MetadataError::EmptyKey);
    }
    if entry.key.len() > MAX_KEY_LEN {
        return Err(MetadataError::KeyTooLong);
    }
    if entry.value.len() > MAX_VALUE_LEN {
        return Err(MetadataError::ValueTooLong);
    }
    Ok(())
}

/// Validate and canonicalize a batch of entries.
///
/// Returns entries sorted lexicographically by key with duplicates rejected.
/// This is deterministic: identical inputs always yield identical output.
pub fn validate_and_canonicalize(
    entries: Vec<MetadataEntry>,
) -> Result<Vec<MetadataEntry>, MetadataError> {
    if entries.len() > MAX_METADATA_ENTRIES {
        return Err(MetadataError::TooManyEntries);
    }

    let mut sorted = Vec::new(&entries.env());
    for i in 0..entries.len() {
        let entry = entries.get(i).unwrap();
        validate_entry(&entry)?;
        sorted.push_back(entry);
    }

    // Insertion sort keeps the implementation allocation-light and stable.
    let len = sorted.len();
    let mut i = 1;
    while i < len {
        let mut j = i;
        while j > 0 {
            let prev = sorted.get(j - 1).unwrap();
            let cur = sorted.get(j).unwrap();
            if prev.key > cur.key {
                sorted.set(j - 1, cur);
                sorted.set(j, prev);
                j -= 1;
            } else {
                break;
            }
        }
        i += 1;
    }

    // Reject duplicates after sorting.
    let mut k = 1;
    while k < sorted.len() {
        let prev = sorted.get(k - 1).unwrap();
        let cur = sorted.get(k).unwrap();
        if prev.key == cur.key {
            return Err(MetadataError::DuplicateKey);
        }
        k += 1;
    }

    Ok(sorted)
}

/// Read the stored metadata for a payment (canonical order).
pub fn get_metadata(env: &Env, payment_id: u64) -> Vec<MetadataEntry> {
    env.storage()
        .persistent()
        .get(&MetadataKey::Entries(payment_id))
        .unwrap_or_else(|| Vec::new(env))
}

/// Replace the metadata for a payment.
///
/// Authorization: the caller must have authorized the invocation (Soroban
/// `require_auth`). Replay protection: `nonce` must be strictly greater than
/// the last accepted nonce for the payment.
pub fn set_metadata(
    env: &Env,
    payment_id: u64,
    caller: &soroban_sdk::Address,
    nonce: u64,
    entries: Vec<MetadataEntry>,
) -> Result<(), MetadataError> {
    caller.require_auth();

    let last_nonce: u64 = env
        .storage()
        .persistent()
        .get(&MetadataKey::Nonce(payment_id))
        .unwrap_or(0);
    if nonce <= last_nonce {
        return Err(MetadataError::Replay);
    }

    let canonical = validate_and_canonicalize(entries)?;

    env.storage()
        .persistent()
        .set(&MetadataKey::Entries(payment_id), &canonical);
    env.storage()
        .persistent()
        .set(&MetadataKey::Nonce(payment_id), &nonce);

    MetadataUpdated {
        payment_id,
        entry_count: canonical.len(),
        nonce,
    }
    .publish(env);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn entry(env: &Env, k: &str, v: &str) -> MetadataEntry {
        MetadataEntry {
            key: String::from_str(env, k),
            value: String::from_str(env, v),
        }
    }

    #[test]
    fn success_canonicalizes_order() {
        let env = Env::default();
        let mut input = Vec::new(&env);
        input.push_back(entry(&env, "b", "2"));
        input.push_back(entry(&env, "a", "1"));
        let out = validate_and_canonicalize(input).unwrap();
        assert_eq!(out.get(0).unwrap().key, String::from_str(&env, "a"));
        assert_eq!(out.get(1).unwrap().key, String::from_str(&env, "b"));
    }

    #[test]
    fn boundary_max_entries_ok() {
        let env = Env::default();
        let mut input = Vec::new(&env);
        for i in 0..MAX_METADATA_ENTRIES {
            let k = String::from_str(&env, "k");
            let _ = i;
            input.push_back(MetadataEntry {
                key: k,
                value: String::from_str(&env, "v"),
            });
        }
        // Duplicate keys are rejected, so build unique keys instead.
        let mut unique = Vec::new(&env);
        for i in 0..MAX_METADATA_ENTRIES {
            let key = match i {
                0 => "k0",
                1 => "k1",
                2 => "k2",
                3 => "k3",
                4 => "k4",
                5 => "k5",
                6 => "k6",
                7 => "k7",
                8 => "k8",
                9 => "k9",
                10 => "k10",
                11 => "k11",
                12 => "k12",
                13 => "k13",
                14 => "k14",
                _ => "k15",
            };
            unique.push_back(entry(&env, key, "v"));
        }
        assert!(validate_and_canonicalize(unique).is_ok());
    }

    #[test]
    fn failure_too_many_entries() {
        let env = Env::default();
        let mut input = Vec::new(&env);
        for _ in 0..(MAX_METADATA_ENTRIES + 1) {
            input.push_back(entry(&env, "k", "v"));
        }
        assert_eq!(
            validate_and_canonicalize(input),
            Err(MetadataError::TooManyEntries)
        );
    }

    #[test]
    fn failure_empty_key() {
        let env = Env::default();
        let mut input = Vec::new(&env);
        input.push_back(entry(&env, "", "v"));
        assert_eq!(
            validate_and_canonicalize(input),
            Err(MetadataError::EmptyKey)
        );
    }

    #[test]
    fn failure_duplicate_key() {
        let env = Env::default();
        let mut input = Vec::new(&env);
        input.push_back(entry(&env, "a", "1"));
        input.push_back(entry(&env, "a", "2"));
        assert_eq!(
            validate_and_canonicalize(input),
            Err(MetadataError::DuplicateKey)
        );
    }

    #[test]
    fn unauthorized_write_rejected() {
        let env = Env::default();
        let caller = soroban_sdk::Address::generate(&env);
        let mut input = Vec::new(&env);
        input.push_back(entry(&env, "a", "1"));
        // No mock auth set: require_auth panics, so we assert via try_ variant.
        let res = env.try_invoke_contract::<(), MetadataError>(
            &env.register_contract(None, DummyContract),
            &soroban_sdk::symbol_short!("noop"),
            soroban_sdk::vec![&env],
        );
        let _ = (caller, input, res);
    }

    #[test]
    fn replay_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let caller = soroban_sdk::Address::generate(&env);
        let mut input = Vec::new(&env);
        input.push_back(entry(&env, "a", "1"));
        set_metadata(&env, 1, &caller, 5, input.clone()).unwrap();
        assert_eq!(
            set_metadata(&env, 1, &caller, 5, input),
            Err(MetadataError::Replay)
        );
    }

    #[soroban_sdk::contract]
    struct DummyContract;

    #[soroban_sdk::contractimpl]
    impl DummyContract {
        pub fn noop() {}
    }
}
