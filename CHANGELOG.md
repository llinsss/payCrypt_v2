# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
