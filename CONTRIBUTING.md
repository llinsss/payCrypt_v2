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
- Admin actions must be explicit, authorized, and observable (events).
- Admin cannot move user funds unless the user has separately authorized the
  movement.
- Admin rotation must be authorized by the current admin and must emit an event.

### Token behavior

- Token transfers must be authorized by the account whose balance decreases.
- The contract must not assume a token is well-behaved: transfers may fail, may
  return unexpected values, or may invoke callbacks.
- Balances must be updated before external calls where re-entrancy could
  otherwise allow double-spending.
- Fee-on-transfer or rebasing tokens are out of scope unless explicitly
  supported and tested.

### Replay

- Authorization entries are bound to a specific invocation (contract, function,
  arguments) and to a ledger window. They must not be replayable across
  different calls or after expiry.
- Any signature or nonce scheme we introduce must include a domain separator and
  a monotonically increasing nonce or an expiry, and must be covered by a test
  that attempts replay.

### Upgrades

- Upgrades are authorized by the admin and must emit an event.
- Upgrade logic must not be reachable without `require_auth` on the admin.
- Storage layout changes must be handled explicitly; do not assume that new code
  can read old storage without a migration path.
- The upgrade path must be covered by a test that verifies unauthorized callers
  cannot upgrade.

### Assumptions

- The Stellar network and Soroban host enforce authorization correctly.
- The admin key is held securely and is not shared.
- Callers are adversarial; we do not trust any address by default.
- Ledger time and sequence numbers are monotonic and provided by the host.

### Out of scope

- Compromise of the Stellar network or the Soroban host itself.
- Compromise of a user's signing device or key management.
- Economic attacks that do not exploit a contract-level authorization flaw.
- Behavior of third-party contracts beyond the assumptions we document here.

### Invariants and their tests

Every invariant below must be linked to a test that enforces it. When you add an
invariant, add the corresponding test in the same pull request.

| Invariant | Test |
| --- | --- |
| Only the admin can change the admin | `test_admin_rotation_requires_admin_auth` |
| Only the admin can pause / unpause | `test_pause_requires_admin_auth` |
| Only the admin can upgrade | `test_upgrade_requires_admin_auth` |
| Only the owner can move their funds | `test_transfer_requires_owner_auth` |
| Unauthorized callers cannot initialize | `test_initialize_requires_auth` |
| Authorization entries cannot be replayed | `test_authorization_replay_rejected` |
| Cross-contract calls re-establish authority | `test_cross_contract_call_requires_auth` |
| Admin actions emit events | `test_admin_action_emits_event` |

If a test name changes, update this table in the same pull request.

## Reporting a vulnerability

Please do not open a public issue for security vulnerabilities. Report them
privately to the maintainers so a fix can be prepared before disclosure.
