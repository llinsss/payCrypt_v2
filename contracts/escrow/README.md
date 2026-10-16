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

### Events

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

Cancellation performs a bounded amount of work: it reads the escrow record,
verifies the caller and state, writes the terminal `Cancelled` state, and emits
a single event. No unbounded iteration or unbounded storage growth is
introduced.

Deadline extension performs a bounded amount of work: it reads the escrow
record, verifies the caller, state, extension count, and duration, writes the
updated deadline and extension count, and emits a single event. No unbounded
iteration or unbounded storage growth is introduced.

## Tests

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
