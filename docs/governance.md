# Soroban Upgrade Governance: Timelock + Multisig

This document specifies the production-compatible governance integration for
replacing the payment contract. A single hot key MUST NOT be able to replace the
payment contract immediately. All replacements flow through a proposal that is
approved by a threshold of signers and can only be executed after a configurable
timelock delay has elapsed.

## Roles

- **Signers**: a fixed set of addresses (multisig members). Each signer may
  approve or cancel a proposal.
- **Threshold**: the minimum number of distinct signer approvals required before
  a proposal becomes executable (e.g. `2-of-3`).
- **Delay**: the timelock duration, in ledgers or seconds, between the moment a
  proposal reaches threshold and the earliest allowed execution time.

## Proposal semantics

A proposal captures the intent to replace the payment contract:

- `proposal_id`: monotonically increasing identifier.
- `new_wasm_hash`: hash of the new payment contract WASM to install.
- `new_contract_id` (optional): the contract address to upgrade/replace.
- `proposer`: the signer that created the proposal.
- `created_at`: ledger/time the proposal was created.
- `eta`: earliest execution time, set to `created_at + delay` once the proposal
  reaches threshold.
- `approvals`: set of signer addresses that have approved.
- `executed`: boolean, set to `true` after successful execution.
- `cancelled`: boolean, set to `true` after emergency cancellation.

Creating a proposal records the intent but does NOT change the payment
contract. The proposer's approval MAY be counted automatically.

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
