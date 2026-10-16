# Escrow Contract

# Escrow Contract

A Soroban escrow contract that holds funds between a creator (depositor) and a
beneficiary until the escrow is funded, released, or cancelled.

## Lifecycle

An escrow moves through the following states:

```
Created (pre-funding) ──fund──▶ Funded ──release──▶ Released (terminal)
        │
        └──cancel──▶ Cancelled (terminal)
```

- **Created** — the escrow exists but has not been funded yet. This is the only
  state in which cancellation is permitted.
- **Funded** — the creator has deposited the escrowed amount.
- **Released** — funds have been paid out to the beneficiary. Terminal.
- **Cancelled** — the escrow was cancelled before funding. Terminal.

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

## Cancellation (pre-funding only)

`cancel` allows the escrow **creator** to abandon an escrow that has not yet
been funded.

- **Permitted actor:** the escrow creator. The call requires the creator's
  authorization (`require_auth`); any other caller is rejected.
- **Permitted state:** `Created` (pre-funding) only. Calling `cancel` on a
  `Funded`, `Released`, or already `Cancelled` escrow fails.
- **Terminal state:** a successful cancellation transitions the escrow to
  `Cancelled`. Once cancelled, the escrow is terminal and no further operations
  (fund, release, or a second cancel) are accepted.
- **No replay:** cancellation is not idempotent. A second `cancel` call on an
  already-cancelled escrow fails with a distinct error (see below), proving the
  transition cannot be replayed.

## Deadline extension policy

`extend_deadline` lets the escrow **creator** push back an escrow's deadline
within strict, bounded limits.

- **Permitted actor:** the escrow creator. The call requires the creator's
  authorization (`require_auth`); any other caller is rejected with
  `NotAuthorized`.
- **Permitted state:** `Created` (pre-funding) only. Extending a `Funded`,
  `Released`, or `Cancelled` escrow fails with `InvalidState`.
- **Per-extension duration:** each extension may add at most
  `MAX_EXTENSION_DURATION` seconds to the deadline. A larger `extension`
  argument is rejected with `ExtensionTooLong`.
- **Extension count:** an escrow may be extended at most `MAX_EXTENSIONS`
  times. Once the count is exhausted, further calls fail with
  `TooManyExtensions`.
- **Overflow guard:** the new deadline is computed with a checked add. If
  `current_deadline + extension` would overflow the timestamp type, the call
  fails with `DeadlineOverflow` rather than wrapping.
- **Bounded work:** each call reads the escrow record, verifies the caller,
  state, and limits, writes the updated deadline and extension count, and emits
  a single event. No unbounded iteration or unbounded storage growth is
  introduced.

### Error codes

| Code | Name                  | Meaning                                                        |
|------|-----------------------|----------------------------------------------------------------|
| 1    | `AlreadyInitialized`  | Escrow has already been initialized.                           |
| 2    | `NotAuthorized`       | Caller is not the permitted actor for the operation.           |
| 3    | `InvalidState`        | Operation is not allowed in the escrow's current state.        |
| 4    | `AlreadyCancelled`    | Escrow was already cancelled; cancellation cannot be replayed. |
| 5    | `TooManyExtensions`   | Escrow has reached the maximum number of deadline extensions.  |
| 6    | `ExtensionTooLong`    | Requested extension exceeds the per-extension maximum.         |
| 7    | `DeadlineOverflow`    | New deadline would overflow the timestamp type.                |
| 8    | `AssetMismatch`       | The supplied asset address does not match the escrow's bound asset. No state is mutated. |
| 9    | `MetadataTooLong`     | Metadata exceeds `MAX_METADATA_LEN` bytes. No state is mutated. |
| 10   | `MetadataInvalidChar` | Metadata contains a character outside the supported printable subset. No state is mutated. |

### Events

Deposit and payout events include the bound asset address so indexers can
verify which asset moved without trusting the caller-supplied argument.

Metadata is carried on the existing escrow creation event; no new event is
emitted for the length/character checks. Rejected metadata produces no event
because no state is mutated.

Cancellation emits a versioned lifecycle event so off-chain indexers can track
state transitions:

```
("escrow", "cancelled")  topics: [version, escrow_id, creator]
```

- `version` — lifecycle event schema version.
- `escrow_id` — identifier of the cancelled escrow.
- `creator` — the actor that authorized the cancellation.

Deadline extension emits a versioned lifecycle event:

```
("escrow", "deadline_extended")  topics: [version, escrow_id, creator]
```

- `version` — lifecycle event schema version.
- `escrow_id` — identifier of the extended escrow.
- `creator` — the actor that authorized the extension.

## Storage and cost

The bound asset is written once at creation and read on every deposit/payout.
Metadata is bounded by `MAX_METADATA_LEN`, so the maximum additional storage
per escrow is fixed and known ahead of time. No additional per-invocation
storage growth is introduced; the asset address is stored alongside the
existing escrow record.

Cancellation performs a bounded amount of work: it reads the escrow record,
verifies the caller and state, writes the terminal `Cancelled` state, and emits
a single event. No unbounded iteration or unbounded storage growth is
introduced.

Deadline extension performs a bounded amount of work: it reads the escrow
record, verifies the caller, state, extension count, and duration, writes the
updated deadline and extension count, and emits a single event. No unbounded
iteration or unbounded storage growth is introduced.

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

Focused tests cover the cancellation path:

- **Success:** the creator cancels a pre-funding escrow; state becomes
  `Cancelled` and the event is emitted.
- **Authorization:** a non-creator caller is rejected with `NotAuthorized`.
- **Boundary:** cancelling a funded escrow is rejected with `InvalidState`.
- **Failure / no replay:** a second `cancel` on a cancelled escrow fails with
  `AlreadyCancelled`.

Focused tests cover the deadline extension path:

- **Success:** the creator extends a pre-funding escrow; the deadline advances
  and the event is emitted.
- **Authorization:** a non-creator caller is rejected with `NotAuthorized`.
- **Boundary:** an extension exactly equal to `MAX_EXTENSION_DURATION` is
  accepted, and the `MAX_EXTENSIONS`-th extension is accepted.
- **Failure:** exceeding `MAX_EXTENSION_DURATION` fails with
  `ExtensionTooLong`; exceeding `MAX_EXTENSIONS` fails with
  `TooManyExtensions`; extending a funded escrow fails with `InvalidState`;
  and a deadline near the timestamp maximum fails with `DeadlineOverflow`.
