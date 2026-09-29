# Indexer Dead-Letter Storage

This document describes the dead-letter storage subsystem for the indexer. It
covers persistence, idempotency, crash recovery, indexing, operational metrics,
and rollback behavior. It complements the checkpoint recovery design in
`docs/indexer-checkpoint-recovery.md`.

## Purpose

When the indexer cannot apply an event (malformed payload, unsupported schema
version, deterministic validation failure, or a transient downstream error that
has exhausted retries), the event must not be silently dropped. Instead it is
moved to a durable **dead-letter store** so it can be inspected, replayed, or
discarded by an operator without losing ordering guarantees for the main
stream.

## Typed Model

Dead-letter entries are represented by a typed Rust struct so that validation is
deterministic and serialization is stable across restarts.

```rust
/// Schema version for the on-disk dead-letter record.
pub const DEAD_LETTER_SCHEMA_VERSION: u32 = 1;

/// Reason an event was dead-lettered.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeadLetterReason {
    /// Payload failed deterministic validation.
    ValidationFailed,
    /// Event schema version is not supported by this indexer build.
    UnsupportedSchema,
    /// Downstream apply failed after all retries were exhausted.
    RetriesExhausted,
}

/// A single dead-lettered indexer event.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeadLetterEntry {
    /// Monotonic ledger sequence the event belongs to.
    pub ledger: u64,
    /// Position of the event within the ledger.
    pub event_index: u32,
    /// Stable identifier used for idempotent writes.
    pub event_id: [u8; 32],
    /// Why the event was dead-lettered.
    pub reason: DeadLetterReason,
    /// Raw event payload, preserved verbatim for replay.
    pub payload: Vec<u8>,
    /// Schema version of this record.
    pub schema_version: u32,
}
```

### Deterministic validation

`DeadLetterEntry::validate` is pure and side-effect free. It rejects entries
that cannot be safely persisted or replayed:

```rust
impl DeadLetterEntry {
    pub fn validate(&self) -> Result<(), DeadLetterError> {
        if self.schema_version != DEAD_LETTER_SCHEMA_VERSION {
            return Err(DeadLetterError::UnsupportedSchema(self.schema_version));
        }
        if self.event_id == [0u8; 32] {
            return Err(DeadLetterError::MissingEventId);
        }
        if self.payload.is_empty() {
            return Err(DeadLetterError::EmptyPayload);
        }
        Ok(())
    }
}
```

Validation is performed **before** any write, so an invalid entry never reaches
the durable store and cannot corrupt recovery state.

## Persistence

Dead-letter entries are appended to a durable, append-only log keyed by
`(ledger, event_index)`. The store exposes a narrow trait so the backing medium
(filesystem, object store, embedded KV) can be swapped without touching the
indexer:

```rust
pub trait DeadLetterStore {
    /// Append an entry. Must be idempotent on `event_id`.
    fn append(&mut self, entry: &DeadLetterEntry) -> Result<(), DeadLetterError>;
    /// Iterate entries in `(ledger, event_index)` order.
    fn iter(&self) -> Result<Vec<DeadLetterEntry>, DeadLetterError>;
    /// Remove an entry after successful replay.
    fn remove(&mut self, event_id: &[u8; 32]) -> Result<(), DeadLetterError>;
}
```

### Schema and versioning

- Every record carries `schema_version`.
- Readers reject records whose version is newer than the running build and
  surface them as `UnsupportedSchema` rather than panicking.
- Version bumps are additive; older readers must be able to skip unknown fields
  without losing the ability to replay known ones.

## Idempotency

The store maintains a set of `event_id` values already persisted. `append`
first checks this set:

1. If `event_id` is present, the write is a no-op and returns `Ok(())`.
2. Otherwise the entry is validated, written, and the id is recorded.

This guarantees that replayed or duplicated dead-letter writes never create
duplicate records, even if the indexer retries the same event after a crash.
The id set is rebuilt from the log on startup, so idempotency survives restarts.

## Crash Recovery

Dead-letter writes are reconciled on restart:

1. **Load** the append-only log and rebuild the `event_id` set.
2. **Validate** every loaded record with `DeadLetterEntry::validate`.
3. **Quarantine** records that fail validation into a separate
   `dead-letter.corrupt` file instead of dropping them, so operators can
   inspect the failure.
4. **Reconcile** any in-flight write that was interrupted: because writes are
   append-only and idempotent on `event_id`, a partially written trailing
   record is detected by its length/checksum and truncated; the event is then
   re-appended from the checkpointed source position.

Recovery is deterministic: given the same log and checkpoint, the rebuilt state
is identical across runs.

## Indexing

Dead-letter entries are indexed by:

- `(ledger, event_index)` — primary ordering for replay.
- `event_id` — idempotency and lookup.
- `reason` — operational triage (e.g. count of `ValidationFailed`).

The index is derived from the log on startup and updated on each append/remove,
so it never diverges from the durable records.

## Operational Metrics

Expose the following counters/gauges:

| Metric | Type | Meaning |
| --- | --- | --- |
| `indexer_dead_letter_total` | counter | Entries appended, labeled by `reason`. |
| `indexer_dead_letter_size` | gauge | Current number of stored entries. |
| `indexer_dead_letter_replayed_total` | counter | Entries successfully replayed and removed. |
| `indexer_dead_letter_corrupt_total` | counter | Records quarantined during recovery. |
| `indexer_dead_letter_append_errors_total` | counter | Failed append attempts. |

Alert when `indexer_dead_letter_size` grows monotonically or when
`indexer_dead_letter_corrupt_total` increases, since both indicate a systemic
problem rather than a one-off bad event.

## Migration

1. Deploy the new build with dead-letter storage disabled (feature flag off).
2. Enable the store; existing checkpoints are unaffected because dead-letter
   state is separate from the main checkpoint.
3. On first enable, the store starts empty and rebuilds its index from the log.
4. No backfill is required: only events that fail after enablement are
   dead-lettered.

## Rollback

- Disabling the feature flag stops new dead-letter writes; the log is left
  intact for later inspection.
- Rolling back to a build without dead-letter support is safe: the log is a
  separate file and is ignored by older builds.
- To fully revert, stop the indexer, archive `dead-letter.log` and
  `dead-letter.corrupt`, then remove them. The main checkpoint and index are
  untouched.

## Testing

- **Unit**: `validate` rejects unsupported schema, missing id, and empty
  payload; accepts a well-formed entry.
- **Property**: appending the same `event_id` N times yields exactly one stored
  record; ordering by `(ledger, event_index)` is stable.
- **Local network**: force a downstream failure, confirm the event is
  dead-lettered, restart the indexer, and confirm recovery rebuilds the index
  and replays the entry exactly once.
- **Failure paths**: truncated trailing record is detected and re-appended;
  corrupt record is quarantined without aborting startup.
