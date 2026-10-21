# Soroban Compatibility and Releases

The machine-readable source of truth is [`compatibility.json`](compatibility.json). The initial support target is Soroban protocol 23 with Rust 1.84 or newer and the exact `soroban-sdk` 23.5.3 dependency. Tokens must implement SEP-41; Stellar Asset Contracts are supported through their SEP-41 interface. Testnet and Futurenet are exercised in CI. Mainnet is not yet a supported deployment target.

`event-types`, `client-sim`, and `wallet-contract` start at crate version 0.1.0. Event consumers must key events by `event_id` and `event_type`, then decode using `schema_version`; do not infer field meaning from event order or position. The canonical identifier is `{transaction_hash}:{operation_index}:{event_index}`. The on-chain `event_type` topic uses stable underscore-separated identifiers such as `wallet_withdrawal_executed`. Indexers add the transaction and operation coordinates when constructing the envelope. New event fields are additive; changing a field's meaning or removing it requires a new event type or schema version and a decoder that retains the previous version.

## CI Network Coverage

The Soroban workflow runs the Rust contract, event fixture, and client simulation tests once for each network profile. These are deterministic local tests configured with the selected network's passphrase; they do not submit transactions to public RPC services or require funded accounts or secrets.

## Wallet Interface Fixture

[`wallet-contract/fixtures/interface.v1.json`](wallet-contract/fixtures/interface.v1.json) captures the wallet's exported functions (name, ordered input names, output count) and its `WalletError` codes. The Soroban workflow builds `wallet_contract.wasm` and runs `scripts/check-wallet-interface.sh`, which fails when the contract's spec drifts from the fixture. Parameter types are not compared by this check.

Removing or renaming a function, reordering or renaming its inputs, or changing an error code is a wallet-interface break for existing clients. Make such a change only with a new contract version and matching client updates. Additive changes (new functions or new error codes with new values) require updating the fixture in the same change so the new surface is reviewed.

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