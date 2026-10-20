# Soroban Compatibility and Releases

The machine-readable source of truth is [`compatibility.json`](compatibility.json). The initial support target is Soroban protocol 23 with Rust 1.84 or newer and the exact `soroban-sdk` 23.5.3 dependency. Tokens must implement SEP-41; Stellar Asset Contracts are supported through their SEP-41 interface. Testnet and Futurenet are exercised in CI. Mainnet is not yet a supported deployment target.

`event-types`, `client-sim`, and `wallet-contract` start at crate version 0.1.0. Event consumers must key events by `event_id` and `event_type`, then decode using `schema_version`; do not infer field meaning from event order or position. The canonical identifier is `{transaction_hash}:{operation_index}:{event_index}`. The on-chain `event_type` topic uses stable underscore-separated identifiers such as `wallet_withdrawal_executed`. Indexers add the transaction and operation coordinates when constructing the envelope. New event fields are additive; changing a field's meaning or removing it requires a new event type or schema version and a decoder that retains the previous version.

## CI Network Coverage

The Soroban workflow runs the Rust contract, event fixture, and client simulation tests once for each network profile. These are deterministic local tests configured with the selected network's passphrase; they do not submit transactions to public RPC services or require funded accounts or secrets.

## SDK Version Alignment

Every `soroban-sdk` declaration in the repository must use the canonical pin in `compatibility.json` (`crates.soroban-sdk`, currently `=23.5.3`), or be recorded in `sdk_exceptions` with the exact requirement it declares. Each exception names the manifest, the requirement, and the reason it has not moved. `lockfiles` lists the lock files that must resolve soroban-sdk to the canonical version.

`node scripts/check-soroban-sdk.js` enforces this. It fails on any undocumented drift, on an exception whose requirement changed or whose manifest no longer declares the SDK, and on a listed lock file that resolves a different version. The `soroban-sdk-alignment` workflow runs it on every change to a Cargo manifest, lock file, the matrix, or the check itself.

Removing an exception is the migration checklist: port the crate to the canonical SDK, update its requirement to the canonical pin, and delete its `sdk_exceptions` entry in the same change.

## Upgrade Sequence

1. Update the compatibility matrix and CI matrix first, and confirm all listed SDK, Rust, protocol, token, and passphrase combinations pass.
2. Deploy new contract Wasm to Testnet, run migration/authorization checks, and verify versioned events with the published decoder fixtures.
3. Promote the identical Wasm and configuration to Futurenet after Testnet acceptance; add Mainnet only after explicit network support and operational review.
4. For a protocol or SDK upgrade, release an additive decoder and client first, then contract Wasm. Preserve old event decoders for the full indexer retention period.

## Rollback Sequence

1. Stop new submissions and record deployed Wasm hashes, network, ledger, and compatibility-matrix revision.
2. Repoint clients to the last compatible release and retain all event decoders already in production.
3. If contract state has changed, use an audited forward migration or an authorized pause/recovery operation. Soroban ledger state cannot be rolled back by redeploying older Wasm.
4. Re-enable submissions only after simulation and balance/auth checks pass against current state on each supported network.