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

## Registry contract: events and storage

This section is the canonical reference for the registry contract's externally
visible contract: the tag keys it stores, how versions are assigned and
compared, the events it emits, and what an indexer must do to reconstruct
registry state from those events. Treat it as the source of truth when changing
storage layout or event payloads.

### Canonical tag keys

Tags are addressed by a canonical, normalized key so that logically identical
tags always resolve to the same storage entry:

- **Normalization** — keys are lowercased and trimmed of surrounding
  whitespace before use. Callers must not rely on case or padding to
  distinguish tags.
- **Encoding** — a tag key is stored as a `Symbol`/`String` under the registry
  data key namespace, prefixed by the registry's storage key enum so tag
  entries never collide with configuration or ownership entries.
- **Uniqueness** — the normalized key is the primary identity of a tag. Two
  inputs that normalize to the same key refer to the same tag and share its
  version history.
- **Reserved keys** — keys reserved for contract configuration (for example
  admin/owner entries) are not valid tag keys and are rejected.

### Version semantics

Each tag carries a monotonically increasing version:

- **Assignment** — the first registration of a tag key starts at version `1`.
  Every subsequent successful update to that key increments the version by
  exactly one. Versions are never reused or decremented.
- **Comparison** — versions are compared as unsigned integers. A higher version
  is strictly newer; equal versions denote the same revision. Consumers should
  treat a lower version as stale and ignore it.
- **Evolution** — updates are append-only with respect to history: the current
  version is overwritten in place, while prior versions remain observable only
  through the emitted events (see below). There is no in-storage version list,
  which keeps per-invocation work and storage growth bounded.
- **Concurrency** — because versions are assigned inside the contract, the
  ledger ordering of invocations defines the authoritative version sequence;
  callers must not assume a version they computed off-chain will be accepted.

### Event topics

The registry emits events with a stable topic layout so indexers can filter
without decoding payloads:

- **Topic 0** — the contract/registry identifier.
- **Topic 1** — the event kind, one of the registry lifecycle kinds (for
  example `register`, `update`, `transfer`, `remove`).
- **Topic 2** — the canonical tag key affected by the event.
- **Data** — the event payload, containing at minimum the new version and the
  values needed to reconstruct the entry (owner/authority and the stored
  value).

Event kinds and their payload fields are part of the public interface: adding a
kind or changing a payload field is a breaking change for indexers and must be
documented in the pull request.

### Indexer reconstruction requirements

An indexer can rebuild registry state from the event stream alone. To do so it
must:

- **Track the latest version per key** — apply events in ledger order and keep
  the highest version seen for each canonical tag key; discard out-of-order or
  duplicate deliveries whose version is not greater than the stored one.
- **Apply only successful events** — failed invocations emit no state-changing
  events, so the indexer must not synthesize entries from error paths.
- **Reconstruct entries from payloads** — each event payload must contain
  enough data (owner/authority, value, version) to rebuild the entry without
  reading contract storage.
- **Handle removals** — a removal event tombstones the key; the indexer should
  drop the entry while retaining the last version for ordering checks.
- **Be idempotent and replay-safe** — reprocessing the same ledger range must
  converge to the same state, since events may be delivered more than once.

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
