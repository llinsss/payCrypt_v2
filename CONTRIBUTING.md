# Contributing

Thanks for your interest in contributing! This document covers the basics of
getting set up, the conventions we follow, and the security expectations for
changes that touch on-chain logic.

## Getting started

1. Fork the repository and create a feature branch.
2. Install the toolchain described in the project README.
3. Make your change, keeping it focused on a single issue.
4. Run the existing test suite before opening a pull request.
5. Open a pull request that references the issue it resolves.

## Pull request expectations

- Keep changes surgical and scoped to the issue being addressed.
- Do not refactor unrelated code or reformat files you are not otherwise touching.
- Add or update tests for any behavior change.
- Update documentation when you change a public interface or a security-relevant
  assumption.

## Contract roadmap (Rust / Soroban)

All on-chain work targets Rust contracts compiled to Soroban WASM and deployed to
Stellar. There are no Cairo or Starknet deliverables in the active roadmap; any
remaining references to them are historical and must not be treated as planned
work. The milestones below are sequenced: a milestone may not start until every
milestone it depends on has met its definition of done and passed its testnet
gate.

### M1 — Registry contract

- **Scope:** Rust/Soroban registry contract: entry registration, lookup, and
  admin-gated updates.
- **Depends on:** none.
- **Definition of done:** registry entry points implemented with `require_auth`
  on every privileged action; unit tests cover registration, lookup, and
  unauthorized updates; contract builds to WASM.
- **Testnet gate:** deploy to Stellar testnet, register and look up an entry, and
  confirm an unauthorized update is rejected.

### M2 — Wallet contract

- **Scope:** Rust/Soroban wallet contract: account authority, balance movement,
  and admin controls.
- **Depends on:** M1.
- **Definition of done:** wallet entry points implemented with `require_auth` on
  the owning account for any balance change; unit tests cover authorized and
  unauthorized transfers; contract builds to WASM.
- **Testnet gate:** deploy to Stellar testnet, move funds with owner
  authorization, and confirm an unauthorized transfer is rejected.

### M3 — Escrow contract

- **Scope:** Rust/Soroban escrow contract: fund locking, release, and refund
  paths, built on the wallet and registry contracts.
- **Depends on:** M1, M2.
- **Definition of done:** escrow entry points implemented with `require_auth` on
  the funding account and on the release/refund authority; unit tests cover
  release, refund, and unauthorized release; contract builds to WASM.
- **Testnet gate:** deploy to Stellar testnet, complete a full lock → release
  cycle and a lock → refund cycle, and confirm an unauthorized release is
  rejected.

### M4 — SDK

- **Scope:** client SDK that builds and submits Soroban invocations for the
  registry, wallet, and escrow contracts, including authorization entry
  construction.
- **Depends on:** M1, M2, M3.
- **Definition of done:** SDK exposes typed calls for each contract entry point;
  tests cover invocation construction and authorization entry assembly against
  the deployed testnet contracts.
- **Testnet gate:** drive a registry lookup, a wallet transfer, and an escrow
  release end-to-end through the SDK against Stellar testnet.

### M5 — Indexer

- **Scope:** indexer that ingests Soroban contract events emitted by the
  registry, wallet, and escrow contracts and exposes queryable state.
- **Depends on:** M1, M2, M3.
- **Definition of done:** indexer ingests events for each contract, handles
  reorgs/ledger gaps, and exposes queries matching on-chain state; tests cover
  event ingestion and query correctness.
- **Testnet gate:** run the indexer against Stellar testnet, emit events from
  each contract, and confirm indexed state matches on-chain state.

### M6 — Deployment

- **Scope:** deployment tooling and runbooks for the Rust/Soroban contracts,
  including WASM upload, initialization, and admin setup.
- **Depends on:** M1, M2, M3, M4, M5.
- **Definition of done:** deployment scripts upload and initialize each contract
  on testnet reproducibly; runbook documents admin setup and upgrade steps;
  tests cover the deployment flow.
- **Testnet gate:** perform a clean deployment of all contracts to Stellar
  testnet from scratch and verify each contract is initialized and reachable
  through the SDK and indexer.

### Migration boundaries

- Cairo/Starknet artifacts are not part of the active roadmap and must not be
  extended. New work is Rust/Soroban only.
- Any migration of existing behavior must land as a Rust/Soroban contract with
  its own tests and testnet gate before the corresponding Cairo/Starknet path is
  retired.
- Storage layout changes across contract versions require an explicit migration
  path; do not assume new code can read old storage.

## Security: Soroban authorization and threat model

Any change that touches authorization, admin controls, token movement, or
upgrade paths must be reviewed against the threat model below. The threat model
is contract-level: it describes the authority behind each privileged action, the
assumptions we rely on, what is explicitly out of scope, and the test that
enforces each invariant.

### Authorization contexts

Soroban authorization is expressed through `require_auth` calls on addresses
(accounts or contracts). A contract must never assume that a caller is
authorized simply because it was invoked; authority is established only by an
explicit `require_auth` on the relevant address within the current invocation
context.

- **Account authority** — an `Address` representing a user account. The account
  must sign the authorization entry (or have it delegated) for the call to
  succeed.
- **Contract authority** — an `Address` representing another contract. The
  authorizing contract must itself call `require_auth` on the address, which
  means the authority ultimately traces back to an account or a contract that
  was authorized in the same call tree.
- **Invocation context** — authorization entries are scoped to a specific
  contract, function, and argument set. Reusing an entry for a different call is
  not valid.

### Privileged actions and their authority

| Privileged action | Required authority | Enforced by |
| --- | --- | --- |
| Initialize the contract | Deployer / initializer address | `require_auth` on the initializer during `initialize` |
| Change admin | Current admin | `require_auth` on the current admin |
| Pause / unpause | Admin | `require_auth` on the admin |
| Upgrade the contract | Admin | `require_auth` on the admin before `update_current_contract_wasm` |
| Move user funds | The owning account | `require_auth` on the account whose balance changes |
| Mint / burn (if applicable) | Admin or the token contract itself | `require_auth` on the minting authority |
| Set fees / parameters | Admin | `require_auth` on the admin |

If a new privileged action is added, it must be added to this table together
with the authority that gates it and the test that proves the gate holds.

### Cross-contract calls

- A cross-contract call does **not** inherit the caller's authority. The callee
  must perform its own `require_auth` checks.
- When our contract calls into another contract, we must treat the callee as
  untrusted: validate return values, do not assume the callee will not re-enter,
  and do not assume the callee's state is consistent with ours.
- When another contract calls into us, we must not assume the caller is
  trustworthy. Every state-changing entry point must re-establish authority.
- Re-entrancy: any entry point that makes an external call must be safe to
  re-enter, or must be guarded so that it cannot be.

### Admin power

- The admin is a single point of trust. Compromise of the admin key is a
  compromise of the contract's privileged surface.
- Admin actions must be explicit, authorized

## External audit package (Rust / Soroban)

This section defines the audit-ready artifact we hand to an external reviewer.
It is assembled from a tagged commit so the reviewer audits exactly what we
intend to ship. The package is documentation plus reproducible commands; it does
not change contract behavior.

### Package contents

1. **Scope** — every Rust contract and every privileged operation, mapped to
   source files and tests (see the scope table below).
2. **Threat model** — the Soroban contract attack surface, assumptions, and
   out-of-scope items (see "Security: Soroban authorization and threat model").
3. **Storage map** — every persistent, instance, and temporary storage key with
   its type and owning contract.
4. **Auth matrix** — each privileged operation mapped to its required
   authorization (see "Privileged actions and their authority").
5. **Invariants** — the properties that must hold across all entry points, each
   tied to the test that enforces it.
6. **Deployment manifests** — the WASM hashes, contract IDs, and admin addresses
   for the audited deployment.
7. **Reproducible test commands** — the exact commands a reviewer runs to
   reproduce the build and test results.

### Scope: contracts and privileged operations

Every Rust contract in the workspace is in scope. For each contract, list its
privileged entry points and the source file and test that cover them. A contract
is not in scope for the audit until this table is complete for it.

| Contract | Privileged operation | Source file | Test |
| --- | --- | --- | --- |
| Registry | `initialize`, `set_admin`, `register`, `update` | `contracts/registry/src/lib.rs` | `contracts/registry/src/test.rs` |
| Wallet | `initialize`, `set_admin`, `transfer`, `pause` | `contracts/wallet/src/lib.rs` | `contracts/wallet/src/test.rs` |
| Escrow | `initialize`, `set_admin`, `release`, `refund` | `contracts/escrow/src/lib.rs` | `contracts/escrow/src/test.rs` |

Update this table whenever a contract or a privileged entry point is added,
renamed, or removed; an out-of-date scope table invalidates the package.

### Storage map

Soroban storage is partitioned by durability. Document every key, its durability
class, and its value type. Keys are namespaced per contract so two contracts
cannot collide on the same ledger entry.

| Contract | Key | Durability | Value type |
| --- | --- | --- | --- |
| Registry | `Admin` | instance | `Address` |
| Registry | `Entry(Address)` | persistent | `EntryRecord` |
| Wallet | `Admin` | instance | `Address` |
| Wallet | `Balance(Address)` | persistent | `i128` |
| Wallet | `Paused` | instance | `bool` |
| Escrow | `Admin` | instance | `Address` |
| Escrow | `Escrow(u64)` | persistent | `EscrowRecord` |
| Escrow | `Nonce` | temporary | `u64` |

Rules:

- Instance storage holds contract-wide configuration (admin, pause flag) and is
  read on nearly every call; keep it small.
- Persistent storage holds per-user or per-record state that must survive ledger
  entry expiry; extend its TTL on write.
- Temporary storage holds short-lived scratch data (nonces, in-flight markers)
  and may be evicted; never store authority or balances there.
- Any new key must be added to this table with its durability and value type
  before the change is merged.

### Invariants

Each invariant must hold after every entry point returns, and each must have a
test that fails if the invariant is broken.

- **Admin is set before privileged calls.** No privileged entry point succeeds
  while `Admin` is unset; `initialize` sets it exactly once.
- **Authorization is per-call.** Every privileged entry point calls
  `require_auth` on the correct address in the current invocation; no entry point
  relies on a prior call's authorization.
- **Balances are conserved.** A transfer moves value without creating or
  destroying it; the sum of balances is unchanged by any non-mint, non-burn call.
- **Escrow is single-release.** An escrow can be released or refunded at most
  once; a second attempt fails.
- **Pause is total.** While `Paused` is set, every state-changing entry point
  rejects the call.
- **Upgrade preserves storage.** An upgrade changes code only; existing storage
  keys and their value types remain readable.

### Deployment manifests

Record the audited deployment so a reviewer can verify the on-chain artifact
matches the audited source. Capture, per contract:

- the tagged commit and the WASM hash built from it,
- the deployed contract ID on the target network,
- the admin address and the initializer address,
- the network passphrase and the ledger at deployment.

Store manifests under `deploy/manifests/<network>/<contract>.json` and reference
the tagged commit in the package cover note.

### Reproducible test commands

A reviewer must be able to reproduce the build and test results from the tagged
commit with no local state. Run from the repository root:

```sh
# Pin the toolchain and build every contract to WASM.
rustup show
cargo build --workspace --target wasm32-unknown-unknown --release

# Run the full contract test suite.
cargo test --workspace

# Run only the authorization and invariant tests.
cargo test --workspace -- auth invariant
```

Record the exact toolchain version (`rustup show`) and the commit hash in the
package cover note; a result that cannot be reproduced from the tagged commit is
not audit-ready.
