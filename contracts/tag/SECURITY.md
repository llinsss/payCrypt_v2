# Security Model: Tag Registry Contract

This document is the normative design artifact for the Rust/Soroban tag
registry's security invariants. It covers the trust boundary, privileged roles,
replay behaviour, failure-safe state transitions, and the migration, indexing,
monitoring, and rollback behaviour required by the Soroban migration acceptance
criteria.

The implementation lives in `contracts/tag/src/lib.rs`. Tests are in:

- `contracts/tag/src/security_invariants_tests.rs` — trust boundary, privileged
  roles, replay, failure-safe, and property tests.
- `contracts/tag/src/contract_tests.rs` — authorization, state machine, events.
- `contracts/tag/src/confusable_tests.rs` — Unicode confusable rejection.

---

## Trust boundary

The contract has exactly one privileged role: the **tag owner**. No other
address has write access to the registry. The trust boundary is enforced
exclusively through `Address::require_auth`, which aborts a transaction when
the required authorization is absent. There is no fallback, no default, and no
bypass path.

Consequences:

- A call from any unauthorized address fails with a host-level abort, not a
  contract error. Indexers and monitoring systems see the transaction as reverted
  rather than as a contract-level rejection.
- There is no admin key, no deployer key, and no recovery multisig. The owner is
  the only key that matters after initialization.

---

## Privileged roles

| Operation          | Required authorization | Failure mode      |
|--------------------|------------------------|-------------------|
| `initialize`       | none (first-writer)    | `AlreadyInitialized` on replay |
| `initialize_tag`   | none (first-writer)    | `AlreadyInitialized` on replay; `InvalidTagName` on bad input |
| `propose_transfer` | current owner          | host abort        |
| `cancel_transfer`  | current owner          | host abort; `NoPendingTransfer` if no proposal |
| `accept_transfer`  | pending destination    | host abort; `NoPendingTransfer` if no proposal |
| `get_tag`          | none (read-only)       | `NotInitialized`  |
| `inspect_tag`      | none (read-only)       | never fails       |
| `tag_byte_len`     | none (read-only)       | never fails       |
| `get_pending_transfer` | none (read-only)   | returns `None`    |

No other role exists. There is no admin, no pauser, and no privileged deployer
after initialization. The absence of an admin key is a deliberate choice: there
is no operation that justifies unilateral override of the ownership record.

---

## Replay behaviour

The two-step ownership transfer is the replay guard. The state machine enforces
that each operation can only succeed once per proposal:

```
UNINITIALIZED
    │  initialize / initialize_tag
    ▼
REGISTERED (owner = A, pending = None)
    │  propose_transfer(B)
    ▼
PENDING (owner = A, pending = B)
    │  accept_transfer          │  cancel_transfer
    ▼                           ▼
REGISTERED (owner = B)     REGISTERED (owner = A)
```

Replay properties:

- `accept_transfer` removes the pending record atomically before returning. A
  re-played accept finds no pending record and fails with `NoPendingTransfer`.
- `cancel_transfer` removes the pending record atomically before returning. A
  re-played cancel finds no pending record and fails with `NoPendingTransfer`.
- `propose_transfer` replaces any existing pending record atomically. A
  superseded destination is no longer authorised and cannot accept.
- `initialize` / `initialize_tag` check for the tag key before writing. A
  re-played initialization fails with `AlreadyInitialized`.

There is no replay window based on ledger sequence or timestamp. The state
machine itself is the guard, which means replay protection is independent of
clock skew and ledger reorg depth.

---

## Failure-safe state transitions

Every write operation is either fully applied or leaves state unchanged. The
Soroban host does not commit partial writes; a transaction that aborts rolls
back all storage mutations.

Contract-level failure modes:

| Scenario | Stored tag | Pending slot |
|----------|-----------|--------------|
| Bad tag name on init | unchanged (None) | unchanged (None) |
| Unauthorized propose | unchanged | unchanged (None) |
| Unauthorized cancel | unchanged | unchanged |
| Unauthorized accept | unchanged | unchanged |
| Replayed accept | owner = accepted destination | None |
| Replayed cancel | unchanged | None |
| Double init | unchanged (first init) | unchanged |

None of these produce a partially-written state. The contract never reads a slot
and conditionally writes another; each entry point reads everything it needs,
authorizes, then writes atomically.

---

## Migration behaviour

The contract stores two keys in instance storage: `"tag"` (a `Tag` struct) and
`"pending"` (a `PendingTransfer` struct). Both are `#[contracttype]` and are
versioned by the XDR encoding used by the Soroban host.

### Schema upgrade rules

1. Adding a new optional field to `Tag` or `PendingTransfer` requires a
   migration entry point that reads the old record, adds the new field with a
   default value, and writes the new record. The entry point must be
   owner-authorized.
2. Removing a field or changing a field type is a breaking change. It requires
   deploying a new contract and migrating ownership via the two-step transfer,
   with the old contract proposing to the new contract's deployer address.
3. Adding a new storage key is non-breaking. The new key can be written on first
   access without a migration entry point.

### Entry point compatibility

`initialize` (the Symbol-based entry point) is retained for clients that
canonicalize before submitting. It is not deprecated but callers should prefer
`initialize_tag`, which normalizes on-chain and therefore does not trust the
caller's canonicalization.

The stable error codes in `TagNameError` are append-only and never renumbered.
They are used as event topics and metric labels; renumbering would silently
corrupt dashboards and alerts.

---

## Indexing

An off-chain indexer must apply the same normalization as the contract to stay
consistent with on-chain state. The normalization is defined in
`contracts/tag/src/normalize.rs` and is intentionally pure: no ledger state, no
allocation, no panics. A Rust indexer can import the crate directly. A
non-Rust indexer must reimplement the five steps in order:

1. Reject the first non-ASCII byte.
2. Trim leading and trailing ASCII whitespace.
3. Strip at most one leading `@`.
4. Reject if the surviving span is empty or longer than 32 bytes.
5. ASCII-lowercase every remaining byte and reject any byte outside `[a-z0-9_]`.

The stable error codes (`TagNameError::code`) can be used as indexer dimensions
for counting rejection reasons without string parsing.

Events are published by `publish_transfer_event` using the deprecated
`Events::publish` API. The topic layout is `(Symbol("transfer_pending" |
"transfer_accepted" | "transfer_cancelled"),)` and the data is `(from: Address,
to: Address)`. This layout is frozen until the event schema version is bumped.
Indexers must not depend on field names, only on position.

---

## Monitoring

Recommended counters and their derivation:

| Metric | Source |
|--------|--------|
| `tag_initialized_total` | count of successful `initialize_tag` calls |
| `tag_rejection_total{code=N}` | count of `inspect_tag` calls with `accepted=false` and `code=N` |
| `transfer_proposed_total` | count of `transfer_pending` events |
| `transfer_accepted_total` | count of `transfer_accepted` events |
| `transfer_cancelled_total` | count of `transfer_cancelled` events |
| `auth_failure_total` | count of reverted transactions on the contract address |

Rejection code `3` (NonAscii) is the confusable rejection dimension; a spike
indicates a spoofing attempt using Unicode lookalikes.

---

## Rollback behaviour

The contract has no upgrade mechanism. A rollback is a re-deployment of an older
WASM hash. The instance storage is preserved across re-deployments, so a
rollback does not lose the tag or the pending transfer record.

If a bad migration is deployed and writes an incompatible storage schema, the
rollback procedure is:

1. Deploy the rollback WASM.
2. If the storage schema is incompatible, add a recovery entry point to the
   rollback WASM that reads the corrupted record, interprets it best-effort, and
   writes a clean record.
3. Call the recovery entry point with owner authorization.
4. Remove the recovery entry point in a subsequent deployment.

Because the contract has no admin key, the owner is the only address that can
authorize a migration or recovery entry point. If the owner key is lost, the tag
is permanently locked and can only be superseded by deploying a new contract.
