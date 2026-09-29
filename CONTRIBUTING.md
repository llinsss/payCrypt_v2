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
| Recover a tag | Governance authority | `require_auth` on the governance address, after the recovery delay and evidence checks |

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

### Tag ownership recovery and governance

Tag ownership is normally controlled by the owner through ordinary transfer:
the owner authorizes the move and the tag changes hands immediately. Recovery is
a separate, exceptional path for when the owner loses access or a registered
destination becomes unusable. It is **not** a substitute for transfer and must
never be used to move a tag the owner still controls.

#### Trust model and governance authority

- The **owner** is the account that currently controls the tag. Ordinary
transfer requires `require_auth` on the owner and takes effect immediately.
- The **governance authority** is a distinct address (or multisig) that is
  authorized to execute recovery. It is configured at initialization and can
  only be changed by the current governance authority, emitting an event.
- Governance is a single point of trust for recovery only. It cannot move user
  funds, cannot transfer tags outside the recovery path, and cannot bypass the
  delay or evidence requirements below.
- Recovery authority is deliberately separate from the admin so that a
  compromised admin key does not by itself grant the ability to seize tags.

#### Recovery is distinct from transfer

- Ordinary transfer: owner-authorized, immediate, no delay, no evidence.
- Recovery: governance-authorized, subject to a mandatory delay, requires
  evidence, and emits a distinct event. Recovery entry points must not be
  reachable through the transfer path and vice versa.
- A tag that is not in a recoverable state (owner still active, destination
  usable) must not be recoverable.

#### Delay requirement

- Recovery cannot execute in the same ledger as it is requested. A request must
  record the ledger sequence (or timestamp) at which it was made, and execution
  must be rejected until at least the configured recovery delay has elapsed.
- The delay gives the current owner a window to contest or re-establish access.
- The delay is a contract parameter set by governance and must be non-zero.

#### Evidence requirement

- A recovery request must supply evidence justifying the recovery (for example,
  proof that the owner key is lost or that the registered destination is
  unusable). The evidence is recorded with the request and is emitted in the
  request event so it is auditable off-chain.
- Execution must be rejected if no evidence was supplied with the request.
- Evidence is bound to the specific tag and request; it cannot be reused to
  recover a different tag.

#### Events

- Requesting recovery emits a `recovery_requested` event containing the tag, the
  requester, the evidence, and the ledger at which the delay started.
- Executing recovery emits a `recovery_executed` event containing the tag, the
  previous owner, and the new owner.
- Cancelling a recovery emits a `recovery_cancelled` event.

#### Scope of recovery

- Recovery applies only to the specific tag named in the request. It must not
  affect any other tag, even one owned by the same owner.
- Recovery must not be usable to seize a tag whose owner is still able to
  authorize a transfer.

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
| Only governance can recover a tag | `test_recovery_requires_governance_auth` |
| Recovery cannot execute before the delay elapses | `test_recovery_respects_delay` |
| Recovery requires evidence | `test_recovery_requires_evidence` |
| Recovery cannot seize unrelated tags | `test_recovery_cannot_seize_unrelated_tags` |

If a test name changes, update this table in the same pull request.

## Reporting a vulnerability

Please do not open a public issue for security vulnerabilities. Report them
privately to the maintainers so a fix can be prepared before disclosure.
