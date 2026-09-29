# Signed Rust Contract Release Manifests

This directory defines the **signed release manifest** format used to gate
Soroban contract deployments. A manifest pins every input that can change a
compiled artifact, records the deterministic identity of the artifact, and is
signed by an approved release key before any environment accepts it.

## Goals

- **Pinned inputs** — toolchain, source commit, and dependency lock are recorded
  so a build is reproducible.
- **Artifact identity** — the compiled wasm is identified by a deterministic
  hash, not by a filename or a mutable tag.
- **Environment validation** — network passphrase and contract id are checked
  against the target environment before approval.
- **Release approval** — a manifest is only valid when signed by a key that is
  authorized for the target environment.
- **Rollback** — every release records the previously deployed artifact so a
  rollback is a first-class, auditable operation.

## Manifest schema

A manifest is a JSON document with the following fields. All fields are
required unless marked optional.

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | `u32` | Manifest format version. Currently `1`. |
| `contract_name` | `string` | Logical contract name (e.g. `indexer`). |
| `source_commit` | `string` | Full 40-char git commit the artifact was built from. |
| `toolchain` | `object` | Pinned Rust/Soroban toolchain (see below). |
| `dependency_lock_hash` | `string` | SHA-256 of `Cargo.lock` at build time. |
| `artifact` | `object` | Artifact identity (see below). |
| `environment` | `object` | Target environment binding (see below). |
| `previous_artifact` | `object` (optional) | Artifact identity of the currently deployed release, used for rollback. |
| `signatures` | `array` | One or more release signatures (see below). |

### `toolchain`

| Field | Type | Description |
| --- | --- | --- |
| `rust_version` | `string` | Exact `rustc` version, e.g. `1.79.0`. |
| `soroban_sdk_version` | `string` | Exact `soroban-sdk` version. |
| `target` | `string` | Build target, e.g. `wasm32-unknown-unknown`. |

### `artifact`

| Field | Type | Description |
| --- | --- | --- |
| `wasm_sha256` | `string` | Lowercase hex SHA-256 of the compiled wasm. |
| `wasm_size` | `u64` | Size of the compiled wasm in bytes. |

### `environment`

| Field | Type | Description |
| --- | --- | --- |
| `network` | `string` | `testnet`, `futurenet`, or `mainnet`. |
| `network_passphrase` | `string` | Exact Stellar network passphrase. |
| `contract_id` | `string` | Expected contract id (`C...`) for this environment. |

### `signatures[]`

| Field | Type | Description |
| --- | --- | --- |
| `key_id` | `string` | Identifier of the signing key. |
| `algorithm` | `string` | Signature algorithm, currently `ed25519`. |
| `signature` | `string` | Base64-encoded signature over the canonical manifest bytes. |

## Deterministic validation

Validation is deterministic and side-effect free. Given a manifest and a target
environment, a release is accepted only if **all** of the following hold:

1. `schema_version` is a supported version.
2. `source_commit` is a full 40-char lowercase hex commit.
3. `dependency_lock_hash` and `artifact.wasm_sha256` are 64-char lowercase hex.
4. `artifact.wasm_size` is greater than zero.
5. `environment.network_passphrase` matches the target environment's passphrase.
6. `environment.contract_id` matches the target environment's contract id.
7. At least one entry in `signatures` verifies against the canonical manifest
   bytes and belongs to a key authorized for `environment.network`.

Canonical manifest bytes are the JSON serialization of the manifest with the
`signatures` field removed, keys sorted lexicographically, and no insignificant
whitespace. This makes the signed payload independent of formatting.

## Approval and rollback

- A manifest is **approved** only after validation succeeds and the required
  number of authorized signatures is present.
- Approval is recorded together with the manifest hash so the exact approved
  bytes can be re-verified later.
- `previous_artifact` records the artifact that was live before this release.
  A rollback re-deploys `previous_artifact` and emits a new manifest whose
  `artifact` is the rolled-back-to artifact and whose `previous_artifact` is the
  artifact that was just replaced.
- Rollbacks use the same validation and signature requirements as forward
  releases; there is no unsigned rollback path.

## Failure and replay handling

- **Unauthorized signer** — a signature from a key not authorized for the
  environment fails validation.
- **Replay** — a manifest is bound to a specific `environment.contract_id` and
  `source_commit`; reusing a manifest against a different contract id or
  environment fails validation. Consumers must also reject a manifest whose
  `artifact.wasm_sha256` equals the currently deployed artifact.
- **Tampering** — any change to a signed field invalidates all signatures.
- **Missing previous artifact** — a first release may omit `previous_artifact`;
  a rollback requires it to be present.

## Migration notes

- Existing deployments should emit a manifest for the currently live artifact
  before the first signed release, so `previous_artifact` is populated.
- Indexers should key on `artifact.wasm_sha256` and `source_commit` rather than
  on filenames or tags.
- Monitoring should alert on validation failures, unauthorized signers, and
  replay attempts, and should record the manifest hash for every approval.
