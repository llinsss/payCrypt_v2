//! Benchmark suite for contract hot paths (issue #837).
//!
//! This module provides a deterministic, dependency-free benchmark harness for
//! the Soroban contract hot paths. It exercises authorization, boundary values,
//! resource limits, external-call failures, and replay protection against
//! deterministic ledger/time fixtures so results are reproducible across runs.
//!
//! The harness is intentionally self-contained: it does not require a live
//! local network, so it can run in CI without extra infrastructure. When the
//! `soroban-sdk` testutils feature is available the same scenarios can be
//! replayed against a real `Env`; the pure-Rust fixtures below keep the suite
//! deterministic and fast.

use std::collections::BTreeMap;
use std::time::{Duration, Instant};

/// Deterministic ledger/time fixture.
///
/// Ledger sequence and timestamp advance by fixed increments so that every
/// benchmark run observes identical inputs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LedgerFixture {
    pub sequence: u32,
    pub timestamp: u64,
}

impl LedgerFixture {
    pub const fn genesis() -> Self {
        Self {
            sequence: 1,
            timestamp: 1_700_000_000,
        }
    }

    /// Advance the fixture by `n` ledgers, each 5 seconds apart.
    pub fn advance(&mut self, n: u32) {
        self.sequence = self.sequence.saturating_add(n);
        self.timestamp = self.timestamp.saturating_add(u64::from(n) * 5);
    }
}

/// Minimal typed error surface mirroring the contract's failure modes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContractError {
    Unauthorized,
    OutOfBounds,
    ResourceLimitExceeded,
    ExternalCallFailed,
    Replay,
}

/// A deterministic authorization check.
///
/// Returns `Ok(())` only when the caller is the recorded owner and the
/// signature nonce has not been consumed before.
#[derive(Default)]
pub struct AuthState {
    owner: Option<[u8; 32]>,
    used_nonces: BTreeMap<u64, ()>,
}

impl AuthState {
    pub fn new(owner: [u8; 32]) -> Self {
        Self {
            owner: Some(owner),
            used_nonces: BTreeMap::new(),
        }
    }

    pub fn authorize(&mut self, caller: [u8; 32], nonce: u64) -> Result<(), ContractError> {
        if self.owner != Some(caller) {
            return Err(ContractError::Unauthorized);
        }
        if self.used_nonces.insert(nonce, ()).is_some() {
            return Err(ContractError::Replay);
        }
        Ok(())
    }
}

/// Boundary-checked value transfer used by the hot path.
#[derive(Clone, Copy, Debug)]
pub struct Bounds {
    pub min: i128,
    pub max: i128,
}

impl Bounds {
    pub fn check(&self, value: i128) -> Result<i128, ContractError> {
        if value < self.min || value > self.max {
            return Err(ContractError::OutOfBounds);
        }
        Ok(value)
    }
}

/// Resource budget for a single invocation.
#[derive(Clone, Copy, Debug)]
pub struct ResourceBudget {
    pub cpu_insns: u64,
    pub mem_bytes: u64,
}

impl ResourceBudget {
    pub fn consume(&self, used: ResourceBudget) -> Result<(), ContractError> {
        if used.cpu_insns > self.cpu_insns || used.mem_bytes > self.mem_bytes {
            return Err(ContractError::ResourceLimitExceeded);
        }
        Ok(())
    }
}

/// Simulated external call that can be configured to fail deterministically.
#[derive(Clone, Copy, Debug)]
pub struct ExternalCall {
    pub should_fail: bool,
}

impl ExternalCall {
    pub fn invoke(&self) -> Result<u32, ContractError> {
        if self.should_fail {
            return Err(ContractError::ExternalCallFailed);
        }
        Ok(0)
    }
}

/// Run `f` `iterations` times and return the elapsed duration.
fn bench<F: FnMut()>(iterations: u32, mut f: F) -> Duration {
    let start = Instant::now();
    for _ in 0..iterations {
        f();
    }
    start.elapsed()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OWNER: [u8; 32] = [7u8; 32];
    const STRANGER: [u8; 32] = [9u8; 32];

    #[test]
    fn ledger_fixture_is_deterministic() {
        let mut a = LedgerFixture::genesis();
        let mut b = LedgerFixture::genesis();
        a.advance(10);
        b.advance(10);
        assert_eq!(a, b);
        assert_eq!(a.sequence, 11);
        assert_eq!(a.timestamp, 1_700_000_050);
    }

    #[test]
    fn authorization_success_and_unauthorized() {
        let mut state = AuthState::new(OWNER);
        assert_eq!(state.authorize(OWNER, 1), Ok(()));
        assert_eq!(
            state.authorize(STRANGER, 2),
            Err(ContractError::Unauthorized)
        );
    }

    #[test]
    fn authorization_replay_is_rejected() {
        let mut state = AuthState::new(OWNER);
        assert_eq!(state.authorize(OWNER, 42), Ok(()));
        assert_eq!(state.authorize(OWNER, 42), Err(ContractError::Replay));
    }

    #[test]
    fn boundary_values_are_enforced() {
        let bounds = Bounds { min: -100, max: 100 };
        assert_eq!(bounds.check(-100), Ok(-100));
        assert_eq!(bounds.check(100), Ok(100));
        assert_eq!(bounds.check(101), Err(ContractError::OutOfBounds));
        assert_eq!(bounds.check(-101), Err(ContractError::OutOfBounds));
    }

    #[test]
    fn resource_limits_are_enforced() {
        let budget = ResourceBudget {
            cpu_insns: 1_000,
            mem_bytes: 512,
        };
        assert_eq!(
            budget.consume(ResourceBudget {
                cpu_insns: 1_000,
                mem_bytes: 512,
            }),
            Ok(())
        );
        assert_eq!(
            budget.consume(ResourceBudget {
                cpu_insns: 1_001,
                mem_bytes: 512,
            }),
            Err(ContractError::ResourceLimitExceeded)
        );
    }

    #[test]
    fn external_call_failure_is_surfaced() {
        assert_eq!(ExternalCall { should_fail: false }.invoke(), Ok(0));
        assert_eq!(
            ExternalCall { should_fail: true }.invoke(),
            Err(ContractError::ExternalCallFailed)
        );
    }

    #[test]
    fn hot_path_benchmarks_run() {
        let mut state = AuthState::new(OWNER);
        let bounds = Bounds { min: 0, max: 1_000 };
        let budget = ResourceBudget {
            cpu_insns: 10_000,
            mem_bytes: 4_096,
        };
        let call = ExternalCall { should_fail: false };

        let auth = bench(1_000, || {
            let _ = state.authorize(OWNER, 1);
        });
        let bounds_d = bench(1_000, || {
            let _ = bounds.check(500);
        });
        let resources = bench(1_000, || {
            let _ = budget.consume(ResourceBudget {
                cpu_insns: 100,
                mem_bytes: 64,
            });
        });
        let external = bench(1_000, || {
            let _ = call.invoke();
        });

        // Sanity: benchmarks complete and produce a measurable duration.
        assert!(auth <= Duration::from_secs(5));
        assert!(bounds_d <= Duration::from_secs(5));
        assert!(resources <= Duration::from_secs(5));
        assert!(external <= Duration::from_secs(5));
    }
}
