# Withdrawal Liability Accounting

Pending withdrawal proposals reserve funds per token so the same balance cannot back two withdrawals.

## Invariant

For each token, `reserved_balance(token)` equals the sum of `amount` over proposals that are neither executed nor released. Because `propose_withdrawal` requires `balance - reserved >= amount`, the reserved total never exceeds the wallet's token balance.

## Lifecycle

| Event | Effect on `reserved_balance` |
| --- | --- |
| `propose_withdrawal` succeeds | `+ amount` |
| `execute` succeeds | `- amount` (after the token transfer) |
| `release_withdrawal` succeeds on an expired proposal | `- amount` |

An expired proposal cannot be executed, and `release_withdrawal` requires expiry, so each proposal's reservation is freed exactly once.

## Reentrancy and transfer failures

Withdrawal-state mutations (`propose_withdrawal`, `approve`, `revoke_approval`, `execute`, and `release_withdrawal`) reject while a token call is in progress. The contract holds a temporary instance-storage guard around token balance/transfer calls. During `execute`, the proposal is marked executed, its reservation is freed, and the execution nonce advances before calling the token; the guard prevents a token callback from acting on those intermediate effects.

Soroban invocation atomicity rolls back the proposal flag, reservation, nonce, guard, token effects, and events if the token call fails. A failed transfer therefore leaves the proposal eligible for a later execution attempt, subject to its normal expiry and signer/approval rules. The guard entry is removed on success and does not add persistent per-withdrawal storage.

## Functions

- `reserved_balance(token) -> i128`: total reserved for `token`. Available balance is `token balance of the wallet - reserved_balance(token)`.
- `release_withdrawal(proposal_id)`: permissionless. Frees the reservation of an expired, unexecuted proposal. Moves no tokens.

## Error codes

| Code | Name | Raised by |
| --- | --- | --- |
| 20 | `InsufficientAvailableBalance` | `propose_withdrawal` when `balance - reserved < amount` |
| 21 | `ProposalNotExpired` | `release_withdrawal` while the proposal is still live |
| 22 | `ProposalReleased` | `release_withdrawal` on an already released proposal |
| 16 | `ReentrancyDetected` | Withdrawal-state mutation attempted during a token balance/transfer call |

`release_withdrawal` on an executed proposal returns the existing `ProposalExecuted` (14). Unknown ids return `UnknownProposal` (10).

## Events

New event `wallet_withdrawal_released` (schema_version 1), emitted by `release_withdrawal`:

- topics: `event_type`, `schema_version`, `proposal_id`
- data: `token`, `amount`

No existing event changed shape. Indexers that do not handle `wallet_withdrawal_released` can ignore it.
`wallet_withdrawal_executed` is still emitted only after a successful transfer; a failed transfer emits no execution event.

## Storage and work bounds

- One instance entry per token for the reserved total (`Reserved(token)`).
- One instance flag per released proposal (`Released(proposal_id)`).
- Propose, execute, and release each perform a constant number of storage reads and writes and one token balance query at propose time. The guard is one transient instance-storage entry, removed after each successful token call; no operation iterates over proposals.
