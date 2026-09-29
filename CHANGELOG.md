# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Tag ownership recovery and governance policy (#720). Recovery is a
governance-gated process, separate from ordinary user-controlled transfer,
and requires a mandatory delay plus supporting evidence before it can
execute.
- Rust/Soroban SDK examples for end-to-end payments: typed APIs for building,
signing, submitting, and confirming Soroban payment transactions, with
deterministic (canonical) serialization of payment intents and results,
cancellation of in-flight operations, and typed, actionable error
classification (validation, unauthorized, replay/duplicate, network,
contract, timeout) (#849).
- Rust SDK event decoding compatibility tests: typed decoding of Soroban
contract events into the canonical payment model with deterministic
validation, plus unit/property tests covering success, boundary,
unauthorized, replay, and failure paths, and actionable classification of
decoding errors (#850).
- Rust SDK mock transport and contract clients: typed contract client APIs
with deterministic request/response serialization and compatibility
handling, an in-memory mock transport for deterministic local testing, and
cancellation-aware transport/client layers with actionable error
classification (validation, unauthorized, replay/duplicate, transport,
contract, timeout). Includes unit/property/local-network tests covering
success, boundary, unauthorized, replay, and failure paths, plus migration,
indexing, monitoring, and rollback notes (#851).
- Rust/Soroban SDK multi-signer transaction support: typed signer collection,
  deterministic signature aggregation and validation, canonical serialization,
  cancellation, and actionable error classification (#852).
- Rust/Soroban release checklist covering pinned inputs, artifact identity,
  environment validation, release approval, and rollback (#859).
- Rust/Soroban contract documentation generation with pinned toolchain and
  dependency inputs, deterministic artifact identity (content hashing and
  versioning), pre-generation environment validation, release approval, and
  documented rollback behavior (#868).
- Rust/Soroban contract changelog policy defining pinned inputs, artifact
  identity, environment validation, release approval, and rollback for
  contract releases (#869).
- Operator runbooks for Rust/Soroban contract failures covering pinned inputs,
  artifact identity, environment validation, release approval, and rollback,
  with deterministic validation and tests for success, boundary, unauthorized,
  replay, and failure paths (#871).
- Rust release and compatibility matrix (`compatibility-matrix.json`) tracking the
  Rust toolchain version, Soroban SDK version, Soroban protocol version, network
  passphrase, contract WASM hash, and client crate compatibility for each
  supported release.
- CI coverage that validates the compatibility matrix and exercises the
  supported network combinations (testnet, futurenet, mainnet) against it.
- Documentation of upgrade sequencing and rollback limits for contract and
  client upgrades.

### Security
- Circuit breaker inspection and reset endpoints are now restricted to
  authenticated admins, resets are rate-limited, and successful resets are
  written to the audit log (#553).

## [1.0.0] - 2024-02-21

### Added

- Rust release and compatibility matrix (`compatibility-matrix.json`) tracking the
  Rust toolchain version, Soroban SDK version, Soroban protocol version, network
  passphrase, contract WASM hash, and client crate compatibility for each
  supported release.
- CI coverage that validates the compatibility matrix and exercises the
  supported network combinations (testnet, futurenet, mainnet) against it.
- Documentation of upgrade sequencing and rollback limits for contract and
  client releases.

### Compatibility Matrix

The machine-readable matrix lives in `compatibility-matrix.json` at the
repository root. Each entry describes a single supported release and pins the
following fields:

| Field | Description |
| --- | --- |
| `rustVersion` | Rust toolchain version used to build the release. |
| `sorobanSdkVersion` | Soroban SDK crate version the contract targets. |
| `protocolVersion` | Soroban protocol version the contract is compiled for. |
| `networkPassphrase` | Stellar network passphrase the release is validated against. |
| `contractWasm` | SHA-256 hash of the released contract WASM artifact. |
| `clientCrate` | Client crate name and compatible version range. |

### Upgrade Sequencing

1. Publish the new contract WASM and record its hash in the compatibility
   matrix before announcing the release.
2. Release the client crate only after the contract WASM hash is recorded, so
   clients can pin a known-good contract.
3. Roll out to testnet, then futurenet, then mainnet, verifying each network
   passphrase entry in the matrix.
4. Update the matrix entry's `protocolVersion` and `sorobanSdkVersion` only
   after the corresponding network has been upgraded.

### Rollback Limits

- A contract WASM can be rolled back only to a previously published hash that
  is still present in the compatibility matrix.
- Protocol version upgrades are not reversible on-chain; once a network is
  upgraded, only forward-compatible contract and client releases may be used.
- Client crate rollbacks are limited to versions whose `clientCrate` range
  still matches the deployed contract's `sorobanSdkVersion`.
