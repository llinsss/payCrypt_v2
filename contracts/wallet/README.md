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

## Storage TTL and Upgrades

All wallet state (owner, router, token, pending and recovery router slots, pause
flag) lives in instance storage, so it shares one TTL.

- `initialize`, the router proposal/commit functions, and `withdraw` renew the
  instance TTL when it drops below `INSTANCE_TTL_THRESHOLD` (120,960 ledgers),
  extending it to `INSTANCE_TTL_EXTEND_TO` (518,400 ledgers).
- `extend_ttl()` renews the same TTL on demand. It is permissionless, changes no
  wallet state, and fails with `WalletError::NotInitialized` before `initialize`.
- `upgrade(new_wasm_hash)` replaces the contract Wasm. Only the owner may call it
  (failed auth is a host authorization error). The new Wasm must already be
  uploaded. Storage keys are unchanged, so a pending router proposal, its
  `PendingRouterAt` timestamp, and any recovery slot survive the upgrade and can
  still be committed after the delay. The upgrade emits `upgraded` with the owner
  and new Wasm hash.

Every call does a constant amount of TTL work, and the upgrade adds no storage
entries.
