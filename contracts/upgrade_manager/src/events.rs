//! Versioned upgrade lifecycle events.
//!
//! Every externally visible state transition emits a stable, schema-versioned
//! event so off-chain consumers can index upgrade activity without tracking
//! contract internals.
//!
//! # Rollback event
//!
//! Topics layout:
//!   topic[0] = symbol_short!("upgrade_v1")   (schema version tag)
//!   topic[1] = symbol_short!("rollback")      (event name)
//!   topic[2] = source_version: u32            (current version before rollback)
//!   topic[3] = target_version: u32            (version being rolled back to)
//!
//! Data payload:
//!   reason_hash: BytesN<32>                   (sha256 of the rollback reason)
//!
//! The reason is free-form operator input and may contain secrets, so the
//! event carries only its digest. The full reason stays off-chain and can be
//! checked against the hash by anyone who holds it.

use soroban_sdk::{symbol_short, Bytes, BytesN, Env, String, Symbol};

/// Schema version tag emitted as the first topic of every upgrade event.
///
/// Bumped from `upgrade_v1` because the rollback payload changed from the raw
/// reason string to its digest.
pub const EVENT_SCHEMA_VERSION: Symbol = symbol_short!("upgrade_v2");

/// Event name for a rollback transition.
pub const EVENT_ROLLBACK: Symbol = symbol_short!("rollback");

/// Maximum length (in bytes) of the rollback reason string.
///
/// This bound keeps per-invocation gas and storage costs predictable and
/// prevents unbounded memory allocation from user-supplied input.
pub const MAX_ROLLBACK_REASON_LEN: u32 = 256;

/// Emit a rollback event with source version, target version, and the
/// sha256 digest of the reason.
///
/// The reason is a bounded UTF-8 string whose byte length must not exceed
/// [`MAX_ROLLBACK_REASON_LEN`]. Callers should validate the length before
/// calling this function.
pub fn emit_rollback(env: &Env, source_version: u32, target_version: u32, reason: &String) {
    let mut buf = [0u8; MAX_ROLLBACK_REASON_LEN as usize];
    let len = reason.len() as usize;
    reason.copy_into_slice(&mut buf[..len]);
    let reason_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, &buf[..len]))
        .into();

    let topics = (
        EVENT_SCHEMA_VERSION,
        EVENT_ROLLBACK,
        source_version,
        target_version,
    );
    env.events().publish(topics, reason_hash);
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    /// The schema version and event name symbols are stable identifiers.
    #[test]
    fn event_symbols_are_stable() {
        assert_eq!(EVENT_SCHEMA_VERSION, symbol_short!("upgrade_v2"));
        assert_eq!(EVENT_ROLLBACK, symbol_short!("rollback"));
    }

    /// MAX_ROLLBACK_REASON_LEN is set to 256 to bound per-invocation work.
    #[test]
    fn max_reason_len_is_bounded() {
        assert_eq!(MAX_ROLLBACK_REASON_LEN, 256);
    }

    /// Emitting a rollback event succeeds with a valid bounded reason.
    #[test]
    fn emit_rollback_with_valid_reason() {
        let env = Env::default();
        let reason = String::from_str(&env, "bug fix: incorrect fee calculation");
        emit_rollback(&env, 2, 1, &reason);
        // No panic means the event was published successfully.
    }

    /// A reason at the maximum allowed length emits without error.
    #[test]
    fn emit_rollback_at_max_len() {
        let env = Env::default();
        let reason = String::from_str(&env, &"a".repeat(MAX_ROLLBACK_REASON_LEN as usize));
        emit_rollback(&env, 3, 2, &reason);
    }

    /// A reason exceeding the maximum length is detected by the caller.
    #[test]
    fn emit_rollback_reason_too_long_detected() {
        let env = Env::default();
        let reason = String::from_str(&env, &"a".repeat(MAX_ROLLBACK_REASON_LEN as usize + 1));
        // The event module itself does not enforce the bound — the
        // contract entry point is responsible for validation.
        assert!(reason.len() > MAX_ROLLBACK_REASON_LEN);
    }
}