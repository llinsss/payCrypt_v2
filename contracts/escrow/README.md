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

## Metadata limits

Escrow metadata is bounded so that storage growth and per-invocation work stay
predictable. Two rules apply to every metadata value accepted by the contract:

- **Maximum byte length.** Metadata is limited to `MAX_METADATA_LEN` bytes
  (measured in UTF-8 bytes, not characters). Values longer than this are
  rejected before any storage is written.
- **Supported character policy.** Metadata must be a printable UTF-8 subset:
  ASCII graphic characters (`0x20`–`0x7E`) plus the tab (`0x09`) and newline
  (`0x0A`) control characters. Non-printable control characters, DEL (`0x7F`),
  and non-ASCII code points are rejected.

Both checks run **before** the value is written to storage, so an oversized or
invalid value never mutates contract state.

### Error codes

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `AssetMismatch` | The supplied asset address does not match the escrow's bound asset. No state is mutated. |
| 2 | `MetadataTooLong` | Metadata exceeds `MAX_METADATA_LEN` bytes. No state is mutated. |
| 3 | `MetadataInvalidChar` | Metadata contains a character outside the supported printable subset. No state is mutated. |

### Events

Metadata is carried on the existing escrow creation event; no new event is
emitted for the length/character checks. Rejected metadata produces no event
because no state is mutated.

## Storage

The bound asset is written once at creation and read on every deposit/payout.
Metadata is bounded by `MAX_METADATA_LEN`, so the maximum additional storage
per escrow is fixed and known ahead of time. No additional per-invocation
storage growth is introduced; the asset address is stored alongside the
existing escrow record.

## Tests

Focused tests cover:

- Successful deposit and payout with the correct asset.
- Authorization failures for deposit and payout.
- Boundary cases (zero and edge amounts).
- Mismatched-asset failures for both deposit and payout, asserting the
  `AssetMismatch` error and that no state was mutated.
- Metadata success with a valid value.
- Metadata boundary at exactly `MAX_METADATA_LEN` bytes.
- Metadata failure when over `MAX_METADATA_LEN`, asserting `MetadataTooLong`
  and that no state was mutated.
- Metadata failure with unsupported characters, asserting
  `MetadataInvalidChar` and that no state was mutated.
