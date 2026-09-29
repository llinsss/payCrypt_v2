# Contributing

Thanks for your interest in contributing! This document explains how to set up
the project, run the test suites, and submit changes.

## Getting started

1. Fork and clone the repository.
2. Install the toolchain pinned in `rust-toolchain.toml` (Rust + the Soroban
   target used by this project).
3. Build the workspace:

   ```sh
   cargo build --workspace
   ```

## Running tests

Run the full suite before opening a pull request:

```sh
cargo test --workspace
```

### Local-network authorization integration tests

Authorization flows are exercised against a local Soroban network so that
signing, replay protection, resource limits, and external-call failures can be
validated end to end. These tests live under `tests/` and are gated behind the
`local-network` feature so they do not run in the default unit-test pass.

Run them with:

```sh
cargo test --workspace --features local-network -- --nocapture
```

When adding or changing authorization logic, extend the integration tests to
cover:

- **Success paths** — a correctly authorized invocation completes and mutates
  the expected ledger state.
- **Boundary values** — minimum/maximum amounts, expirations, and sequence
  numbers at the edges of the accepted range.
- **Unauthorized paths** — missing, malformed, or wrong-signer authorizations
  are rejected without state changes.
- **Replay paths** — re-submitting a previously consumed authorization fails.
- **Failure paths** — external-call failures and resource-limit exhaustion
  surface as deterministic errors rather than panics.

### Deterministic ledger and time fixtures

Local-network tests must be reproducible. Use the shared fixtures to pin the
ledger sequence, timestamp, and network passphrase instead of relying on wall
clock time or the ambient network:

- Set the ledger sequence and timestamp explicitly before each scenario.
- Advance ledger/time only through the fixture helpers so runs are repeatable.
- Assert on exact error codes and emitted events, not on timing.

## Migration, indexing, monitoring, and rollback

Changes that touch storage layout, contract interfaces, or authorization rules
should document their operational impact in the pull request description:

- **Migration** — describe any state migration, its idempotency, and how it is
  applied to existing deployments.
- **Indexing** — note any new or changed events/keys that downstream indexers
  must consume, including their schema.
- **Monitoring** — list the metrics, logs, or alerts that should be watched
  after rollout, and the expected healthy values.
- **Rollback** — explain how to revert safely, including whether the migration
  is reversible and what happens to data written by the new version.

## Submitting changes

1. Create a topic branch from `main`.
2. Keep commits focused and write clear commit messages.
3. Ensure `cargo test --workspace` (and the local-network suite when relevant)
   passes.
4. Open a pull request describing the change, the tests you added, and any
   migration/monitoring/rollback considerations from the section above.
