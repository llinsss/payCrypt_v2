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

## Functions

- `reserved_balance(token) -> i128`: total reserved for `token`. Available balance is `token balance of the wallet - reserved_balance(token)`.
- `release_withdrawal(proposal_id)`: permissionless. Frees the reservation of an expired, unexecuted proposal. Moves no tokens.

## Error codes

| Code | Name | Raised by |
| --- | --- | --- |
| 20 | `InsufficientAvailableBalance` | `propose_withdrawal` when `balance - reserved < amount` |
| 21 | `ProposalNotExpired` | `release_withdrawal` while the proposal is still live |
| 22 | `ProposalReleased` | `release_withdrawal` on an already released proposal |

`release_withdrawal` on an executed proposal returns the existing `ProposalExecuted` (14). Unknown ids return `UnknownProposal` (10).

## Events

New event `wallet_withdrawal_released` (schema_version 1), emitted by `release_withdrawal`:

- topics: `event_type`, `schema_version`, `proposal_id`
- data: `token`, `amount`

No existing event changed shape. Indexers that do not handle `wallet_withdrawal_released` can ignore it.

## Storage and work bounds

- One instance entry per token for the reserved total (`Reserved(token)`).
- One instance flag per released proposal (`Released(proposal_id)`).
- Propose, execute, and release each perform a constant number of storage reads and writes and one token balance query at propose time. No operation iterates over proposals.
