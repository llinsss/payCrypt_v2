# Contributing

Thanks for your interest in contributing! This document covers the basics of
setting up a development environment, running the test suites, and the
policies we follow for dependency and toolchain management.

## Getting started

1. Fork and clone the repository.
2. Install dependencies for the language(s) you are working in (see below).
3. Create a branch, make your changes, and open a pull request.

## Rust / Soroban contracts

Contracts live under `contracts/`. Rust and Soroban builds are pinned so that
generated WASM and authorization behavior cannot silently change between
machines or CI runs.

### Toolchain

The Rust toolchain is pinned in `rust-toolchain.toml` at the repository root.
`rustup` will automatically install and use the pinned channel, components, and
targets when you run any `cargo` command inside the repository. Do not override
the channel locally (for example with `rustup override set`) when preparing a
pull request.

### Soroban SDK versions

The Soroban SDK is pinned to an exact version in each contract's `Cargo.toml`
(for example `soroban-sdk = "=21.7.7"`). Exact pins are intenti

## WASM size and resource-budget gates

Soroban contracts must stay within deployment and invocation resource limits as
features grow. Every pull request that changes contract code must pass the
resource-budget gates in CI, which measure the built WASM and representative
invocations against agreed regression thresholds.

### What is measured

- **WASM size** — the byte size of each built contract `.wasm` artifact, which
  must stay within the deployment limit.
- **CPU instructions** — the instruction count consumed by representative
  invocations.
- **Memory** — the peak memory bytes consumed by representative invocations.
- **Ledger reads/writes** — the number of ledger entries read and written by
  representative invocations.

### Thresholds

The agreed thresholds live alongside the measurement tooling and are checked
into the repository. CI fails when any measurement exceeds its threshold. When a
change legitimately needs more budget, raise the threshold in the same pull
request and explain why in the description; do not raise it silently.

### Reproducible optimization workflow

To build, measure, and optimize locally:

1. Build the contracts in release mode so the artifacts match CI.
2. Run the resource-budget measurement tooling against the built artifacts and
   the representative invocations.
3. Compare the reported WASM size, CPU, memory, and ledger reads/writes against
   the checked-in thresholds.
4. If a measurement regresses, optimize before raising a threshold. Common
   levers: reduce stored data and ledger writes, avoid unnecessary
   cross-contract calls, shrink serialized types, and remove unused code paths.
5. Re-run the measurement tooling to confirm the change is within budget, then
   open the pull request.

The same steps run in CI, so a local pass is a reliable predictor of a green
build.

## Security: Soroban authorization and threat model

The Rust toolchain is pinned in `rust-toolchain.toml` at the repository root.
`rustup` will automatically install and use the pinned channel, components, and
targets when you run any `cargo` command inside the repository. Do not override
the channel locally (for example with `rustup override set`) when preparing a
pull request.

### Soroban SDK versions

The Soroban SDK is pinned to an exact version in each contract's `Cargo.toml`
(for example `soroban-sdk = "=21.7.7"`). Exact pins are intentional: a minor or
patch bump can change generated WASM or authorization behavior, so upgrades must
be deliberate and reviewed.

### Lockfiles

`Cargo.lock` is checked in for the Rust/Soroban workspace and must not be
git-ignored. Commit lockfile changes alongside the `Cargo.toml` changes that
caused them so builds are reproducible.

## Soroban SDK versions

The Soroban SDK is pinned to an exact version in each contract's `Cargo.toml`
(for example `soroban-sdk = "=21.7.7"`). Exact pins are intentional: a minor or
patch bump can change generated WASM or authorization behavior, so upgrades must
be deliberate and reviewed.

### Lockfiles

`Cargo.lock` is checked in for the Rust/Soroban workspace and must not be
git-ignored. Commit lockfile changes alongside the `Cargo.toml` changes that
caused them so builds are reproducible.

### Upgrading the toolchain or Soroban SDK

When upgrading either the Rust toolchain or the Soroban SDK:

1. Update the pin in `rust-toolchain.toml` and/or the relevant `Cargo.toml`.
2. Run `cargo update -p soroban-sdk` (or the affected crate) to refresh
   `Cargo.lock`, and commit the resulting lockfile.
3. Rebuild all contracts and run the full contract test suite.
4. Verify compatibility: confirm the pinned toolchain still satisfies the
   `rust-version` / edition requirements of the Soroban SDK, and that the SDK
   version is supported by the pinned toolchain.

### Privileged actions and required authority

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

When upgrading either the Rust toolchain or the Soroban SDK:

1. Update the pin in `rust-toolchain.toml` and/or the relevant `Cargo.toml`.
2. Run `cargo update -p soroban-sdk` (or the affected crate) to refresh
   `Cargo.lock`, and commit the resulting lockfile.
3. Rebuild all contracts and run the full contract test suite.
4. Verify compatibility: confirm the pinned toolchain still satisfies the
   `rust-version` / edition requirements of the Soroban SDK, and that the SDK
   version is supported by the target network's protocol version.
5. Call out the upgrade and any behavior changes in the pull request
   description so reviewers can assess the impact on generated WASM and
   authorization logic.

Keep toolchain and SDK upgrades in dedicated pull requests rather than mixing
them with unrelated feature work.

## Pull requests

- Keep changes focused and scoped to a single issue.
- Include tests for new behavior where practical.
- Make sure the relevant test suites pass before requesting review.

### Security model

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
