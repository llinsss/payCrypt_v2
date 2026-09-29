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

## Rust/Soroban release checklist

Every release of the Rust/Soroban components (contracts and the indexer) must
follow this checklist. A release is not approved until every item below is
checked and the evidence is linked in the release pull request.

### 1. Pinned inputs

- [ ] `Cargo.lock` is committed and up to date; the build uses `--locked`.
- [ ] The Rust toolchain is pinned (`rust-toolchain.toml`) and matches CI.
- [ ] The Soroban SDK version is pinned in `Cargo.toml` and recorded in the
      release notes.
- [ ] The target network (passphrase, RPC endpoint, network ID) is recorded.
- [ ] No floating versions (`*`, `>=`, git branches) are introduced.

### 2. Artifact identity

- [ ] The contract WASM is built reproducibly from the tagged commit.
- [ ] The SHA-256 of each WASM artifact is recorded in the release notes.
- [ ] The deployed WASM hash matches the recorded hash on-chain
      (`update_current_contract_wasm` / install hash).
- [ ] The indexer binary/image is tagged with the commit SHA and its digest is
      recorded.
- [ ] Artifacts are signed or otherwise attributable to the release commit.

### 3. Environment validation

- [ ] The target network is reachable and reports the expected network ID.
- [ ] The admin address and contract IDs match the intended environment.
- [ ] Required environment variables/secrets are present and validated before
      deploy (fail fast on missing or malformed values).
- [ ] Storage layout compatibility with the currently deployed version is
      confirmed (migration path exists if it changed).
- [ ] Indexer checkpoints/cursors are recorded so indexing can resume.

### 4. Release approval

- [ ] All tests pass: unit, property, and local-network (integration) tests.
- [ ] The security invariants table below is satisfied for any changed surface.
- [ ] At least one maintainer has reviewed and approved the release PR.
- [ ] The upgrade is authorized by the admin and emits an event.
- [ ] The release notes list pinned inputs, artifact hashes, and the rollback
      plan.

### 5. Rollback

- [ ] The previously deployed WASM hash is recorded and can be reinstalled.
- [ ] The rollback procedure is documented and has been exercised on a local
      network.
- [ ] Storage migrations are reversible, or the forward-only migration is
      explicitly documented with its consequences.
- [ ] Indexer rollback restores the prior checkpoint and re-indexes from it.
- [ ] Monitoring/alerting is in place to detect a failed or partial release
      before rollback is triggered.

### Migration, indexing, monitoring, and rollback notes

- **Migration** — storage layout changes must ship with an explicit migration
  path; never assume new code can read old storage. Record the migration in the
  release notes and test it on a local network.
- **Indexing** — record the indexer checkpoint before deploy so indexing can
  resume deterministically; verify the indexer catches up to the new ledger
  after the upgrade.
- **Monitoring** — confirm ledger-gap alerts and upgrade-aware routing are
  active for the target environment before and after the release.
- **Rollback** — keep the prior artifact hash and checkpoint; a rollback must
  restore both the contract and the indexer to a known-good state.

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
