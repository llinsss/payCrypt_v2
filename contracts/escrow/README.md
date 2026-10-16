# Escrow Contract

A Soroban escrow contract that holds funds on behalf of a payer until a
beneficiary claims them, or until the payer refunds them.

## Asset binding

The asset contract address is bound to the escrow **at creation time** and is
immutable for the lifetime of the escrow. Every deposit and payout entrypoint
requires the caller to pass the asset address explicitly, and the contract
verifies that it matches the escrow's bound asset before any state is mutated.

This prevents asset substitution: a caller cannot deposit or pay out a
different token than the one the escrow was created with, even if the caller
controls a look-alike asset contract.

### Entrypoints

| Entrypoint | Asset parameter | Behavior |
| --- | --- | --- |
| `create_escrow` | `asset: Address` | Stores `asset` on the escrow record. |
| `deposit` | `asset: Address` | Requires `asset == escrow.asset`; otherwise fails with `AssetMismatch`. |
| `payout` | `asset: Address` | Requires `asset == escrow.asset`; otherwise fails with `AssetMismatch`. |

### Error codes

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `AssetMismatch` | The supplied asset address does not match the escrow's bound asset. No state is mutated. |

### Events

Deposit and payout events include the bound asset address so indexers can
verify which asset moved without trusting the caller-supplied argument.

## Storage

The bound asset is written once at creation and read on every deposit/payout.
No additional per-invocation storage growth is introduced; the asset address is
stored alongside the existing escrow record.

## Tests

Focused tests cover:

- Successful deposit and payout with the correct asset.
- Authorization failures for deposit and payout.
- Boundary cases (zero and edge amounts).
- Mismatched-asset failures for both deposit and payout, asserting the
  `AssetMismatch` error and that no state was mutated.
