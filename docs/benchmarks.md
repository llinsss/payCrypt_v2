# Rust Benchmark Suite for Contract Hot Paths

This document describes the Rust/Soroban benchmark suite that exercises the
contract hot paths. It is intended to be reproducible: every benchmark runs
against deterministic ledger and time fixtures so results can be compared
across machines and CI runs.

## Goals

- Measure the cost of the contract hot paths that dominate on-chain execution.
- Cover the failure and boundary surface, not just the happy path:
  - authorization (authorized, unauthorized, expired)
  - boundary values (zero, max, overflow-adjacent)
  - resource limits (CPU/memory budget exhaustion)
  - external-call failures (host errors, reverted sub-calls)
- Keep runs deterministic via fixed ledger sequence, timestamp, and network id.

## Layout

```
benches/
  hot_paths.rs        # criterion entry points for each hot path
  fixtures.rs         # deterministic ledger/time fixtures
  scenarios.rs        # success, boundary, unauthorized, replay, failure cases
```

Benchmarks are registered in `Cargo.toml` under `[[bench]]` with
`harness = false` so `criterion` owns the runner.

## Deterministic fixtures

All benchmarks build their environment from a single fixture module so that
ledger state and time never drift between runs:

```rust
pub const LEDGER_SEQUENCE: u32 = 1_000_000;
pub const LEDGER_TIMESTAMP: u64 = 1_700_000_000;
pub const NETWORK_ID: [u8; 32] = [0x11; 32];

pub fn ledger_info() -> LedgerInfo {
    LedgerInfo {
        sequence_number: LEDGER_SEQUENCE,
        timestamp: LEDGER_TIMESTAMP,
        network_id: NETWORK_ID,
        protocol_version: 20,
    }
}
```

Fixtures must not read wall-clock time or the ambient environment. Any
randomness is seeded from a constant so property tests replay identically.

## Hot paths covered

| Hot path | Success | Boundary | Unauthorized | Replay | Failure |
| --- | --- | --- | --- | --- | --- |
| Authorization check | yes | yes | yes | yes | yes |
| Value transfer / accounting | yes | yes | yes | yes | yes |
| Storage read/write | yes | yes | yes | yes | yes |
| External call dispatch | yes | yes | yes | yes | yes |

Each row is exercised by a `criterion` benchmark group and mirrored by a
unit/property test so regressions are caught even when benchmarks are not run.

## Running

```sh
cargo bench --bench hot_paths
```

Local-network tests (success, boundary, unauthorized, replay, failure) run
with the standard test harness:

```sh
cargo test --features testutils
```

## Interpreting results

- Compare against the committed baseline in CI; a regression beyond the
  configured threshold fails the benchmark job.
- Resource-limit benchmarks report the point at which the budget is exhausted
  rather than a raw duration, so the number is stable across hardware.
- External-call failure benchmarks assert the error variant returned, so a
  change in error mapping is visible even if timing is unchanged.

## Migration, indexing, monitoring, rollback

- **Migration:** benchmarks are additive; no contract storage layout changes.
  Existing deployments are unaffected and no migration entry point is added.
- **Indexing:** benchmark fixtures use the same event schema as production, so
  indexers can replay fixture ledgers without special-casing.
- **Monitoring:** CI publishes benchmark deltas per hot path; alerting keys off
  the same metric names used by the runtime dashboards.
- **Rollback:** the suite is test-only. Reverting the benchmark commit removes
  the `[[bench]]` entries and leaves contract behavior untouched.
