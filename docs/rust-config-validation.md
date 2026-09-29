# Environment-Specific Rust Configuration Validation

This document specifies the deterministic, environment-specific configuration
validation used by the Rust/Soroban migration. It defines pinned inputs,
artifact identity, environment validation, release approval gating, and
rollback behavior, and describes the tests that exercise each path.

## Scope

- Applies to Rust/Soroban build and release configuration.
- Validation is deterministic: identical inputs always produce identical
  results and identical artifact identities.
- Environments are explicit and closed: `local`, `testnet`, `mainnet`.

## Pinned Inputs

All inputs that affect a build are pinned and validated before any artifact is
produced. A configuration is rejected if any pinned input is missing or
unpinned.

| Input | Pinning rule |
| --- | --- |
| Rust toolchain | Exact version, e.g. `1.79.0` (no `stable`/`nightly` channels) |
| Soroban SDK | Exact crate version |
| Dependency set | Locked via `Cargo.lock`; lockfile hash recorded |
| Target | Explicit triple, e.g. `wasm32-unknown-unknown` |
| Build profile | Explicit (`release`), with fixed flags |

Pinned inputs are represented as a typed struct so that unpinned or unknown
values fail to construct rather than silently defaulting.

```rust
pub struct PinnedInputs {
    pub toolchain: String,      // exact version, e.g. "1.79.0"
    pub soroban_sdk: String,    // exact crate version
    pub lockfile_hash: String,  // hex digest of Cargo.lock
    pub target: String,         // e.g. "wasm32-unknown-unknown"
    pub profile: String,        // e.g. "release"
}
```

## Artifact Identity

Artifact identity is derived deterministically from the pinned inputs and the
built output. It is used for release approval and rollback.

- `config_hash`: deterministic hash over the canonical serialization of
  `PinnedInputs` (stable field order, no map iteration).
- `artifact_id`: hash over `config_hash` plus the built Wasm bytes.
- Identity is content-addressed: the same inputs and bytes always yield the
  same `artifact_id`; any change yields a different one.

## Environment Validation

Each environment declares the constraints its configuration must satisfy.
Validation returns a typed result and never panics on invalid input.

```rust
pub enum Environment { Local, Testnet, Mainnet }

pub enum ValidationError {
    UnpinnedInput(String),
    EnvironmentMismatch { expected: Environment, found: Environment },
    MissingApproval,
    ReplayedArtifact(String),
    ArtifactMismatch { expected: String, found: String },
}
```

Rules:

- `local`: any pinned toolchain/SDK is accepted; no approval required.
- `testnet`: pinned inputs required; approval required; replay rejected.
- `mainnet`: pinned inputs required; approval required; replay rejected;
  `artifact_id` must match the approved identity exactly.

Validation is pure and side-effect free so it can be unit- and
property-tested without a network.

## Release Approval Gating

A release proceeds only when all gates pass, in order:

1. Pinned inputs present and well-formed.
2. Environment constraints satisfied.
3. Approval present for the target environment (testnet/mainnet).
4. `artifact_id` not previously released (replay check).
5. `artifact_id` matches the approved identity (mainnet).

Failure at any gate aborts the release and returns the corresponding
`ValidationError`. Gates are evaluated deterministically; the same inputs
produce the same decision.

## Rollback

Rollback restores the last approved `artifact_id` for an environment.

- The approved identity per environment is recorded (indexed by
  `environment -> artifact_id`).
- Rollback verifies the target artifact's `config_hash` and `artifact_id`
  before activation; a mismatch aborts the rollback.
- Rollback is itself gated by approval and is recorded so it cannot be
  replayed against a stale identity.

## Indexing and Monitoring

- Index releases by `(environment, artifact_id)` and by `config_hash` so the
  active configuration for any environment is queryable.
- Emit a structured event on every validation decision: environment,
  `config_hash`, `artifact_id`, gate outcome, and error variant on failure.
- Monitor for repeated `ReplayedArtifact` and `ArtifactMismatch` errors, which
  indicate misconfiguration or an attempted replay.

## Migration Notes

- Existing unpinned configurations must be converted to exact versions before
  they can be validated for testnet/mainnet.
- The lockfile hash is recorded at migration time and must be regenerated
  whenever dependencies change.
- Local development may remain unpinned; promotion to testnet/mainnet requires
  pinned inputs and approval.

## Tests

Tests cover the required paths and are deterministic (no wall-clock or network
dependence):

- **Success**: valid pinned inputs for each environment validate and produce a
  stable `artifact_id`.
- **Boundary**: minimal/maximal pinned values (e.g. exact version strings,
  empty vs. full lockfile hash) validate or fail as specified.
- **Unauthorized**: testnet/mainnet without approval return
  `MissingApproval`.
- **Replay**: re-releasing an already-released `artifact_id` returns
  `ReplayedArtifact`.
- **Failure**: unpinned inputs, environment mismatch, and `artifact_id`
  mismatch return the corresponding `ValidationError`.
- **Property**: for arbitrary valid inputs, validation is deterministic
  (same inputs -> same result) and `artifact_id` changes whenever any pinned
  input changes.
- **Local-network**: a local Soroban network run validates `local` config and
  exercises the release/rollback flow end to end.
