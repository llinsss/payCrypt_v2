# Indexer Checkpoint Recovery

This document specifies the persistence, idempotency, crash-recovery, indexing,
and operational-metrics behavior for indexer checkpoint recovery in the
Rust/Soroban migration. It is the design artifact for issue #853.

## Scope

The indexer consumes Soroban ledger/event streams and applies them to derived
state. Checkpoint recovery guarantees that, after any crash or restart, the
indexer resumes from a deterministic cursor and never double-applies an event.

## Persistence

A checkpoint is a typed record persisted in a durable store (e.g. Postgres or
an embedded key/value store). The canonical shape:

```rust
/// Monotonic cursor into the Soroban ledger/event stream.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Checkpoint {
    /// Last fully processed ledger sequence number.
    pub ledger: u32,
    /// Last fully processed event index within `ledger`.
    pub event_index: u32,
    /// Hash of the ledger header at `ledger`, used to detect reorgs.
    pub ledger_hash: [u8; 32],
}

/// Durable checkpoint store. Implementations MUST be crash-safe:
/// a write is either fully visible after restart or not visible at all.
pub trait CheckpointStore {
    fn load(&self) -> Result<Option<Checkpoint>, StoreError>;
    /// Persist `next` only if it is strictly greater than the stored value.
    fn commit(&self, next: Checkpoint) -> Result<(), StoreError>;
}
```

Persistence rules:

- The store holds at most one committed checkpoint (the high-water mark).
- `commit` is atomic and durable (fsync / transaction commit) before it returns.
- `ledger_hash` is stored alongside the cursor so a reorg can be detected on
  restart by comparing the stored hash with the chain's header at `ledger`.

## Idempotency

Checkpoint writes are idempotent and monotonic:

- `commit(next)` is a no-op when `next <= stored`; it never moves the cursor
  backwards and never partially applies.
- Event application is keyed by `(ledger, event_index)`. Re-processing an event
  at or below the committed checkpoint is skipped, so replays do not
  double-apply or corrupt derived state.
- The cursor is advanced only after the event's effects are durably applied.
  Ordering is: apply effects -> commit checkpoint. A crash between the two
  re-applies the event on restart, which is safe because application is
  idempotent.

## Crash recovery

On startup the indexer:

1. Loads the committed checkpoint (or starts at the configured genesis cursor
   when none exists).
2. Validates `ledger_hash` against the chain header at `ledger`. On mismatch
   (reorg), it rewinds to the last common ancestor and resumes from there.
3. Resumes indexing from the first event strictly after the checkpoint.

Recovery is deterministic: the same committed checkpoint always yields the same
resume point, independent of how many times the process restarted.

## Indexing pipeline integration

```text
loop {
    batch = fetch_events(after = checkpoint)
    for event in batch {
        apply_event(event)          // idempotent, keyed by (ledger, event_index)
        checkpoint = advance(checkpoint, event)
        store.commit(checkpoint)    // durable, monotonic
    }
}
```

The cursor advances only after `apply_event` succeeds. A failed `apply_event`
leaves the checkpoint unchanged so the event is retried on the next pass.

## Operational metrics

Expose the following metrics for monitoring:

- `indexer_checkpoint_ledger` (gauge): current committed ledger.
- `indexer_checkpoint_event_index` (gauge): current committed event index.
- `indexer_checkpoint_commits_total` (counter): successful commits.
- `indexer_checkpoint_skipped_total` (counter): idempotent no-op commits.
- `indexer_checkpoint_reorgs_total` (counter): detected reorg rewinds.
- `indexer_checkpoint_commit_errors_total` (counter): failed commits.
- `indexer_checkpoint_lag_ledgers` (gauge): chain head minus committed ledger.

Alert when `indexer_checkpoint_lag_ledgers` grows unbounded or when
`indexer_checkpoint_commit_errors_total` increases.

## Migration

1. Deploy the checkpoint store schema/keyspace alongside the existing indexer.
2. Backfill the initial checkpoint from the current indexer position (or genesis
   for a fresh deployment).
3. Enable checkpoint commits in the indexing loop.
4. Verify `indexer_checkpoint_ledger` advances and lag stays bounded.

## Rollback

- The checkpoint store is additive; disabling checkpoint commits reverts the
  indexer to its prior behavior without data loss.
- To roll back a bad checkpoint, restore the previous committed value from the
  store's backup and restart; recovery resumes deterministically from it.
- Reorg handling rewinds automatically, so no manual cursor surgery is required
  for chain reorganizations.

## Tests

- Unit: `commit` is monotonic and idempotent; `load` returns the last committed
  value; reorg detection on `ledger_hash` mismatch.
- Property: for any sequence of commits, the stored checkpoint equals the
  maximum committed value; replaying events never changes derived state.
- Local network: crash the indexer mid-batch and assert it resumes from the last
  committed checkpoint without double-applying events.
- Failure paths: store write errors leave the checkpoint unchanged; unauthorized
  or malformed events are rejected without advancing the cursor.
