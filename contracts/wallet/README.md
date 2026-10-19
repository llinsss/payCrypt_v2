# Wallet Contract

A Soroban smart-contract wallet supporting deposits, transfers, withdrawals, and
recovery/governance operations.

## Emergency Pause

The wallet supports an emergency pause that halts **asset-moving** operations
while leaving **recovery** and **governance** operations fully available.

### Scoped permissions

- Only the configured admin/governance address may toggle the pause.
- Unauthorized callers are rejected with `Error::Unauthorized`.

### Behavior while paused

| Operation            | While paused |
| -------------------- | ------------ |
| `transfer`           | Blocked (`Error::Paused`) |
| `withdraw`           | Blocked (`Error::Paused`) |
| `deposit`            | Allowed |
| `recover`            | Allowed |
| Governance ops       | Allowed |
| `pause` / `unpause`  | Allowed (admin only) |

Asset-moving methods return `Error::Paused` when the wallet is paused.

### Error codes

| Code | Name           | Meaning |
| ---- | -------------- | ------- |
| —    | `Unauthorized` | Caller is not the admin/governance address |
| —    | `Paused`       | Asset-moving method invoked while paused |

### Events

- `pause` emits a pause event with the admin address.
- `unpause` emits an unpause event with the admin address.

Storage growth is bounded: the pause state is a single boolean flag, and each
invocation performs a constant amount of work.
