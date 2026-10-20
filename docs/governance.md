# Soroban Upgrade Governance: Timelock + Multisig

This document specifies the production-compatible governance integration for
replacing the payment contract. A single hot key MUST NOT be able to replace the
payment contract immediately. All replacements flow through a proposal that is
approved by a threshold of signers and can only be executed after a configurable
timelock delay has elapsed.

## Roles

- **Signers**: a set of addresses (multisig members), rotated only through
  governance (see [Signer rotation](#signer-rotation)). Each signer may approve
  a proposal. The set holds at most `MAX_SIGNERS` (20) addresses and contains no
  duplicates.
- **Threshold**: the minimum number of distinct signer approvals required before
  a proposal becomes executable (e.g. `2-of-3`). It must be at least `1` and at
  most the number of signers.
- **Delay**: the timelock duration, in ledgers or seconds, between the moment a
  proposal reaches threshold and the earliest allowed execution time.

## Proposal semantics

A proposal captures the intent to replace the payment contract:

- `proposal_id`: monotonically increasing identifier.
- `action`: either `Upgrade(new_wasm_hash)`, the hash of the new payment
  contract WASM to install, or `SignerChange(Add(addr) | Remove(addr))`.
- `new_contract_id` (optional): the contract address to upgrade/replace.
- `proposer`: the signer that created the proposal.
- `created_at`: ledger/time the proposal was created.
- `eta`: earliest execution time, set to `created_at + delay` once the proposal
  reaches threshold.
- `approvals`: set of signer addresses that have approved.
- `executed`: boolean, set to `true` after successful execution.
- `cancelled`: boolean, set to `true` after emergency cancellation.

Creating a proposal records the intent but does NOT change the payment
contract or the signer set. The proposer's approval MAY be counted automatically.

## Signer rotation

- **Propose**: a current signer proposes `Add(addr)` or `Remove(addr)`. The
  proposal is validated against the current signer set and threshold, and is
  rejected if it could not succeed. It uses the configured default delay; a
  per-proposal delay is not accepted for signer changes.
- **Approve and delay**: the same rules as upgrades apply. Approvals come from
  current signers and the change becomes executable after the delay.
- **Execute**: the change is validated again against the current state, because
  the signer set may have changed while the proposal was pending. Only then is
  the set updated.
- **Threshold validation**: a removal is rejected if fewer than `threshold`
  signers would remain. An addition is rejected if the set is already at
  `MAX_SIGNERS`.
- **Final signer protection**: the last remaining signer can never be removed.
- **Approvals of removed signers**: execution counts only approvals from
  addresses that are current signers. An approval from a signer removed before
  execution no longer counts toward the threshold. If a removed signer is later
  re-added, their earlier approval on a still-pending proposal is counted again.
  Operators who need to clear such approvals should cancel the proposal and
  create a new one.
- **Bounds**: storage for the signer set is one list capped at `MAX_SIGNERS`.
  Membership checks and approval counting scan that list once, so per-invocation
  work is bounded by `MAX_SIGNERS`, not by proposal history.

### Signer-change event

Every executed signer change emits one event:

- Topics: `(gov, signer)` (`GOVERNANCE_EVENT_TOPIC`, `SIGNER_EVENT`).
- Data: `(proposal_id: u64, added: bool, signer: Address, signer_count: u32)`,
  where `signer_count` is the size of the set after the change.

Proposing, approving, cancelling and upgrade execution do not emit this event.

## Error codes

| Code | Variant                    | Returned when                                                                 |
|------|----------------------------|-------------------------------------------------------------------------------|
| 1    | `NotInitialized`           | Governance has not been initialized.                                          |
| 2    | `Unauthorized`             | The caller is not a current signer, or is not the admin for cancellation.     |
| 3    | `ProposalNotFound`         | No proposal exists with the given id.                                         |
| 4    | `AlreadyApproved`          | The signer has already approved this proposal.                                |
| 5    | `AlreadyExecuted`          | The proposal has already been executed.                                       |
| 6    | `Cancelled`                | The proposal has been cancelled.                                              |
| 7    | `DelayNotElapsed`          | `now < created_at + delay`.                                                   |
| 8    | `ThresholdNotMet`          | Fewer than `threshold` approvals from current signers.                        |
| 9    | `InvalidThreshold`         | Threshold is `0`, or greater than the number of signers at initialization.    |
| 10   | `SignerAlreadyExists`      | Adding an address already in the set, or a duplicate in the initial set.      |
| 11   | `SignerNotFound`           | Removing an address that is not in the set.                                   |
| 12   | `TooManySigners`           | The set would exceed `MAX_SIGNERS`.                                           |
| 13   | `LastSigner`               | Removing the final remaining signer.                                          |
| 14   | `RemovalBreaksThreshold`   | Removing a signer would leave fewer signers than the threshold.               |

On any error no governance state is changed.

## Delay semantics

- The delay is configurable by governance (itself subject to the same
  threshold) and MUST be greater than zero.
- `eta` is computed when the proposal first reaches the approval threshold.
- Execution is rejected while `now < eta`.
- Changing the delay MUST NOT retroactively shorten the `eta` of an already
  approved proposal.

## Approval semantics

- Only registered signers may approve.
- An approval from an address that has already approved MUST be rejected
  (no double counting).
- A proposal becomes executable only when `approvals.len() >= threshold`.
- Approvals are rejected for proposals that are already executed or cancelled.

## Execution semantics

Execution MUST enforce, in order:

1. The proposal exists.
2. The proposal is not already executed (replay protection).
3. The proposal is not cancelled.
4. `approvals.len() >= threshold`.
5. `now >= eta` (delay elapsed).

Only when all checks pass is the new WASM installed / the payment contract
replaced. The proposal is then marked `executed = true` so that a second
submission of the same proposal is rejected.

## Emergency cancellation

- Any signer (or a designated guardian) MAY cancel a pending proposal before it
  is executed.
- Cancellation sets `cancelled = true` and permanently prevents execution of
  that proposal, even if the delay has elapsed and the threshold was met.
- Cancellation is the emergency stop for a malicious or mistaken proposal; a
  replacement proposal must be created and approved from scratch.
- Cancellation MUST be recorded on-chain (event) so operators can audit it.

## Replay and unauthorized execution

- **Replay**: executing an already-executed proposal MUST fail. The `executed`
  flag is the replay guard; `proposal_id` is never reused.
- **Unauthorized execution**: a caller that is not a registered signer, or a
  proposal that has not met the threshold, or one whose `eta` has not passed,
  MUST be rejected. Authorization is checked before any state mutation.
- **Unauthorized approval**: approvals from non-signers MUST be rejected.

## Test matrix

- Approve with fewer than `threshold` signers, then attempt execution: rejected.
- Reach threshold, attempt execution before `eta`: rejected.
- Reach threshold, advance past `eta`, execute: succeeds and installs the new
  contract.
- Re-submit the same `proposal_id` after execution: rejected (replay).
- Non-signer attempts to approve or execute: rejected (unauthorized).
- Cancel a threshold-met proposal, then attempt execution after `eta`: rejected.
