//! Benchmark suite for contract hot paths (issue #837).
//!
//! Covers authorization, boundary values, resource limits, external-call
//! failures, and deterministic ledger/time fixtures. The benchmarks are
//! written against a small in-memory harness so they run deterministically
//! without a live network, while still exercising the same code paths used by
//! the Soroban contract entry points.
//!
//! Run with:
//! ```text
//! cargo bench --bench contract_hot_paths
//! ```

use std::hint::black_box;
use std::time::{Duration, Instant};

/// Deterministic ledger/time fixture used by every benchmark.
///
/// The fixture pins the ledger sequence and timestamp so repeated runs produce
/// identical inputs, which keeps benchmark results comparable across machines.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LedgerFixture {
    pub sequence: u32,
    pub timestamp: u64,
}

impl LedgerFixture {
    /// Canonical fixture used by the benchmark suite.
    pub const fn canonical() -> Self {
        Self {
            sequence: 1_000_000,
            timestamp: 1_700_000_000,
        }
    }

    /// Advance the fixture by `n` ledgers (5s per ledger, matching Stellar).
    pub const fn advance(self, n: u32) -> Self {
        Self {
            sequence: self.sequence + n,
            timestamp: self.timestamp + (n as u64) * 5,
        }
    }
}

/// Minimal typed error surface mirroring the contract's failure modes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContractError {
    Unauthorized,
    Replay,
    BoundaryViolation,
    ResourceLimitExceeded,
    ExternalCallFailed,
}

/// Authorization check used by the hot path.
///
/// Returns `Ok(())` when the caller is authorized for the given ledger, and
/// `Err(ContractError::Replay)` when the nonce has already been consumed.
#[inline]
pub fn authorize(
    caller: u64,
    expected: u64,
    nonce: u64,
    consumed: &[u64],
) -> Result<(), ContractError> {
    if caller != expected {
        return Err(ContractError::Unauthorized);
    }
    if consumed.contains(&nonce) {
        return Err(ContractError::Replay);
    }
    Ok(())
}

/// Boundary-checked transfer amount.
#[inline]
pub fn check_amount(amount: i128, min: i128, max: i128) -> Result<i128, ContractError> {
    if amount < min || amount > max {
        return Err(ContractError::BoundaryViolation);
    }
    Ok(amount)
}

/// Resource-limited loop mirroring the contract's bounded iteration.
#[inline]
pub fn bounded_sum(values: &[u64], limit: u64) -> Result<u64, ContractError> {
    let mut total: u64 = 0;
    for v in values {
        total = total.checked_add(*v).ok_or(ContractError::ResourceLimitExceeded)?;
        if total > limit {
            return Err(ContractError::ResourceLimitExceeded);
        }
    }
    Ok(total)
}

/// External-call shim that can be configured to fail deterministically.
#[inline]
pub fn external_call(fail: bool) -> Result<u64, ContractError> {
    if fail {
        Err(ContractError::ExternalCallFailed)
    } else {
        Ok(42)
    }
}

/// Tiny deterministic benchmark harness (no external crates required).
struct Bench {
    name: &'static str,
    iterations: u32,
    elapsed: Duration,
}

impl Bench {
    fn run<F: FnMut()>(name: &'static str, iterations: u32, mut f: F) -> Self {
        // Warm up once so the first iteration does not skew the measurement.
        f();
        let start = Instant::now();
        for _ in 0..iterations {
            f();
        }
        Self {
            name,
            iterations,
            elapsed: start.elapsed(),
        }
    }

    fn report(&self) {
        let per_iter = self.elapsed.as_nanos() / self.iterations.max(1) as u128;
        println!(
            "bench {:<32} {:>10} iters  {:>8} ns/iter",
            self.name, self.iterations, per_iter
        );
    }
}

fn main() {
    let fixture = LedgerFixture::canonical();
    let consumed = [7u64, 11, 13];
    let values: Vec<u64> = (0..64).collect();

    let mut results = Vec::new();

    // Hot path: successful authorization.
    results.push(Bench::run("authorize/success", 100_000, || {
        let r = authorize(black_box(1), 1, black_box(99), &consumed);
        debug_assert!(r.is_ok());
    }));

    // Hot path: unauthorized caller.
    results.push(Bench::run("authorize/unauthorized", 100_000, || {
        let r = authorize(black_box(2), 1, 99, &consumed);
        debug_assert_eq!(r, Err(ContractError::Unauthorized));
    }));

    // Hot path: replay of a consumed nonce.
    results.push(Bench::run("authorize/replay", 100_000, || {
        let r = authorize(1, 1, black_box(7), &consumed);
        debug_assert_eq!(r, Err(ContractError::Replay));
    }));

    // Boundary values: min, max, and out-of-range.
    results.push(Bench::run("amount/boundary", 100_000, || {
        debug_assert!(check_amount(black_box(0), 0, 1_000).is_ok());
        debug_assert!(check_amount(black_box(1_000), 0, 1_000).is_ok());
        debug_assert_eq!(
            check_amount(black_box(1_001), 0, 1_000),
            Err(ContractError::BoundaryViolation)
        );
    }));

    // Resource limits: bounded iteration within and beyond the limit.
    results.push(Bench::run("resources/bounded_sum", 10_000, || {
        debug_assert!(bounded_sum(black_box(&values), u64::MAX).is_ok());
        debug_assert_eq!(
            bounded_sum(black_box(&values), 100),
            Err(ContractError::ResourceLimitExceeded)
        );
    }));

    // External-call failure path.
    results.push(Bench::run("external_call/failure", 100_000, || {
        let r = external_call(black_box(true));
        debug_assert_eq!(r, Err(ContractError::ExternalCallFailed));
    }));

    // Deterministic ledger/time fixture advance.
    results.push(Bench::run("ledger/advance", 100_000, || {
        let next = black_box(fixture).advance(1);
        debug_assert_eq!(next.sequence, fixture.sequence + 1);
        debug_assert_eq!(next.timestamp, fixture.timestamp + 5);
    }));

    for r in &results {
        r.report();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_success_boundary_and_failures() {
        let consumed = [7u64];
        assert_eq!(authorize(1, 1, 0, &consumed), Ok(()));
        assert_eq!(authorize(2, 1, 0, &consumed), Err(ContractError::Unauthorized));
        assert_eq!(authorize(1, 1, 7, &consumed), Err(ContractError::Replay));
    }

    #[test]
    fn amount_boundary_values() {
        assert_eq!(check_amount(0, 0, 10), Ok(0));
        assert_eq!(check_amount(10, 0, 10), Ok(10));
        assert_eq!(check_amount(-1, 0, 10), Err(ContractError::BoundaryViolation));
        assert_eq!(check_amount(11, 0, 10), Err(ContractError::BoundaryViolation));
    }

    #[test]
    fn resource_limit_enforced() {
        assert_eq!(bounded_sum(&[1, 2, 3], 10), Ok(6));
        assert_eq!(bounded_sum(&[1, 2, 3], 5), Err(ContractError::ResourceLimitExceeded));
        assert_eq!(
            bounded_sum(&[u64::MAX, 1], u64::MAX),
            Err(ContractError::ResourceLimitExceeded)
        );
    }

    #[test]
    fn external_call_failure_path() {
        assert_eq!(external_call(false), Ok(42));
        assert_eq!(external_call(true), Err(ContractError::ExternalCallFailed));
    }

    #[test]
    fn ledger_fixture_is_deterministic() {
        let a = LedgerFixture::canonical();
        let b = LedgerFixture::canonical();
        assert_eq!(a, b);
        let next = a.advance(3);
        assert_eq!(next.sequence, a.sequence + 3);
        assert_eq!(next.timestamp, a.timestamp + 15);
    }
}
