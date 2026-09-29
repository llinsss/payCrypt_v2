//! Deterministic ledger, time, and address fixtures.
//!
//! Tag normalization must behave identically in a unit test, in `cargo fuzz`,
//! and in an indexer replaying historical ledgers, so the fixtures here pin
//! every input a test could otherwise inherit from the host:
//!
//! * **Ledger** — the sequence number and close timestamp are fixed constants.
//! * **Addresses** — the test host seeds its PRNG with
//!   `Host::TEST_PRNG_SEED` (`"12345678901234567890123456789012"`), so
//!   `Address::generate` returns the same value for the same position in the
//!   same call sequence. [`address`] is the only supported way to obtain one,
//!   which keeps that sequence fixed.
//!
//! `address_sequence_is_reproducible_across_fresh_envs` asserts both
//! properties, so an SDK change that breaks determinism fails here rather than
//! producing irreproducible fuzz failures.

use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Address, Env};

/// Fixed ledger close timestamp: `2024-01-01T00:00:00Z`.
///
/// A round value in the past, so fixtures never drift relative to wall-clock
/// time.
pub const FIXTURE_LEDGER_TIMESTAMP: u64 = 1_704_067_200;

/// Fixed ledger sequence number.
pub const FIXTURE_LEDGER_SEQUENCE: u32 = 1_000_000;

/// Seconds between two fixture ledger closes.
pub const FIXTURE_LEDGER_CLOSE_INTERVAL: u64 = 5;

/// Ledger seeded with the fixture timestamp and sequence number.
pub fn deterministic_env() -> Env {
    let env = Env::default();
    pin_ledger(&env);
    env
}

/// Pin `env` to the fixture timestamp and sequence number.
pub fn pin_ledger(env: &Env) {
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = FIXTURE_LEDGER_TIMESTAMP;
        ledger.sequence_number = FIXTURE_LEDGER_SEQUENCE;
    });
}

/// Advance the fixture ledger by one close, for tests that assert on
/// time-dependent behaviour such as replay windows.
pub fn advance_ledger(env: &Env) {
    env.ledger().with_mut(|ledger| {
        ledger.timestamp += FIXTURE_LEDGER_CLOSE_INTERVAL;
        ledger.sequence_number += 1;
    });
}

/// The next address in the environment's deterministic address sequence.
///
/// Determinism is positional: two calls to this function on two freshly
/// created environments return the same sequence of addresses. Reusing one
/// environment for a later test continues that sequence rather than restarting
/// it, so every test that cares calls [`deterministic_env`] first.
pub fn address(env: &Env) -> Address {
    Address::generate(env)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::vec::Vec;

    fn four_addresses(env: &Env) -> Vec<Address> {
        (0..4).map(|_| address(env)).collect()
    }

    #[test]
    fn ledger_fixture_is_pinned() {
        let env = deterministic_env();
        assert_eq!(env.ledger().timestamp(), FIXTURE_LEDGER_TIMESTAMP);
        assert_eq!(env.ledger().sequence(), FIXTURE_LEDGER_SEQUENCE);
    }

    #[test]
    fn advancing_the_ledger_moves_both_clock_and_sequence() {
        let env = deterministic_env();
        advance_ledger(&env);
        assert_eq!(
            env.ledger().timestamp(),
            FIXTURE_LEDGER_TIMESTAMP + FIXTURE_LEDGER_CLOSE_INTERVAL
        );
        assert_eq!(env.ledger().sequence(), FIXTURE_LEDGER_SEQUENCE + 1);
    }

    #[test]
    fn address_sequence_is_reproducible_across_fresh_envs() {
        assert_eq!(
            four_addresses(&deterministic_env()),
            four_addresses(&deterministic_env())
        );
    }

    #[test]
    fn the_address_sequence_does_not_repeat() {
        let addresses = four_addresses(&deterministic_env());
        for (index, candidate) in addresses.iter().enumerate() {
            for other in &addresses[index + 1..] {
                assert_ne!(candidate, other);
            }
        }
    }
}
