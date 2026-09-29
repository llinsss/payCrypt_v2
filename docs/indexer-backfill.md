# Indexer Backfill Tooling with Bounded Ranges

This document specifies the indexer backfill tooling for the Rust/Soroban
migration. It covers bounded-range indexing, deterministic validation,
persistence and idempotency, crash recovery, indexing semantics, operational
metrics, and rollback behavior.

## 1. Scope

The backfill tool replays historical Soroban contract events over a **bounded
range** of ledgers so that the indexer can catch up without unbounded scans.
A run is defined by an inclusive `[start_ledger, end_ledger]` window and a
`batch_size` that controls how many ledgers are processed per unit of work.

Out of scope: real-time streaming ingestion, reorg handling beyond the
committed checkpoint, and cross-network coordination.

## 2. Typed Configuration and Deterministic Validation

All inputs are typed and validated before any work begins. Validation is
**deterministic**: the same inputs always produce the same accept/reject
decision and the same error variant.

```rust
/// Inclusive ledger range for a backfill run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LedgerRange {
    pub start_ledger: u32,
    pub end_ledger: u32,
}

/// Validated backfill configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackfillConfig {
    pub range: LedgerRange,
    pub batch_size: u32,
    pub contract_id: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum BackfillError {
    /// start_ledger > end_ledger
    InvertedRange { start: u32, end: u32 },
    /// batch_size == 0
    ZeroBatchSize,
    /// contract_id is empty or malformed
    InvalidContractId,
    /// range exceeds the configured maximum span
    RangeTooLarge { span: u64, max: u64 },
}

impl BackfillConfig {
    pub const MAX_SPAN: u64 = 1_000_000;

    pub fn validate(self) -> Result<Self, BackfillError> {
        if self.range.start_ledger > self.range.end_ledger {
            return Err(BackfillError::InvertedRange {
                start: self.range.start_ledger,
                end: self.range.end_ledger,
            });
        }
        if self.batch_size == 0 {
            return Err(BackfillError::ZeroBatchSize);
        }
        if self.contract_id.trim().is_empty() {
            return Err(BackfillError::InvalidContractId);
        }
        let span = (self.range.end_ledger - self.range.start_ledger) as u64 + 1;
        if span > Self::MAX_SPAN {
            return Err(BackfillError::RangeTooLarge {
                span,
                max: Self::MAX_SPAN,
            });
        }
        Ok(self)
    }
}
```

Validation rules (all deterministic):

| Rule | Condition | Error |
| --- | --- | --- |
| Range ordering | `start_ledger <= end_ledger` | `InvertedRange` |
| Batch size | `batch_size >= 1` | `ZeroBatchSize` |
| Contract id | non-empty after trim | `InvalidContractId` |
| Bounded span | `span <= MAX_SPAN` | `RangeTooLarge` |

## 3. Persistence and Idempotency

Progress is persisted as a **checkpoint** after each successfully committed
batch. A checkpoint records the last fully processed ledger and a run
identifier so that replays are idempotent.

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Checkpoint {
    pub run_id: String,
    pub contract_id: String,
    pub last_committed_ledger: u32,
    pub events_indexed: u64,
}

pub trait CheckpointStore {
    fn load(&self, run_id: &str) -> Result<Option<Checkpoint>, StoreError>;
    /// Must be atomic: either the whole checkpoint is written or none of it.
    fn commit(&self, checkpoint: &Checkpoint) -> Result<(), StoreError>;
}
```

Idempotency guarantees:

- Each batch is keyed by `(run_id, ledger)`. Re-processing a ledger that was
  already committed is a no-op because the indexer upserts by
  `(contract_id, ledger, event_index)`.
- A checkpoint is only advanced **after** the batch's events are durably
  written. If the process dies mid-batch, the checkpoint still points at the
  previous ledger and the batch is safely retried.
- `run_id` is derived deterministically from
  `(contract_id, start_ledger, end_ledger)` so re-running the same command
  resumes the same logical run instead of creating duplicates.

## 4. Crash Recovery

On startup the tool:

1. Loads the checkpoint for the derived `run_id`.
2. If none exists, begins at `range.start_ledger`.
3. If one exists, resumes at `last_committed_ledger + 1`.
4. Processes batches until `end_ledger` is reached.

```rust
pub fn resume_from(
    cfg: &BackfillConfig,
    store: &dyn CheckpointStore,
    run_id: &str,
) -> Result<u32, StoreError> {
    match store.load(run_id)? {
        Some(cp) => Ok(cp.last_committed_ledger.saturating_add(1)),
        None => Ok(cfg.range.start_ledger),
    }
}
```

Recovery invariants:

- **No skipping:** resume always starts at `last_committed_ledger + 1`.
- **No reprocessing of committed work:** committed ledgers are never re-emitted
  as new events (upsert semantics).
- **At-least-once delivery:** a batch may be retried after a crash, but the
  upsert makes the effect idempotent.
- A run is complete when `last_committed_ledger == end_ledger`.

## 5. Indexing

For each ledger in the current batch the tool:

1. Fetches events for `contract_id` at that ledger.
2. Normalizes each event into an index record keyed by
   `(contract_id, ledger, event_index)`.
3. Upserts records into the index store.
4. Commits the checkpoint for the batch.

Batches are processed in ascending ledger order so that the checkpoint is
monotonic and gaps are detectable.

## 6. Operational Metrics

Emit the following metrics for monitoring (Prometheus-style names):

| Metric | Type | Description |
| --- | --- | --- |
| `backfill_ranges_processed_total` | counter | Batches committed |
| `backfill_events_indexed_total` | counter | Events upserted |
| `backfill_failures_total` | counter | Failed batches by error class |
| `backfill_lag_ledgers` | gauge | `end_ledger - last_committed_ledger` |
| `backfill_run_duration_seconds` | histogram | Per-batch duration |
| `backfill_checkpoint_ledger` | gauge | Current committed ledger |

Alerting guidance:

- Page if `backfill_failures_total` increases over a 5-minute window.
- Warn if `backfill_lag_ledgers` does not decrease over 15 minutes.
- Track `backfill_events_indexed_total` against expected event volume.

## 7. Migration, Monitoring, and Rollback

### Migration

1. Deploy the index schema with the `(contract_id, ledger, event_index)`
   unique key required for idempotent upserts.
2. Deploy the checkpoint store table/collection.
3. Run the backfill over bounded ranges, oldest first, in ascending order.
4. Verify `backfill_checkpoint_ledger` reaches `end_ledger` for each run.

### Monitoring

- Watch `backfill_lag_ledgers` trending to zero.
- Confirm `backfill_failures_total` stays flat.
- Cross-check `backfill_events_indexed_total` against source event counts.

### Rollback

- The backfill is additive and idempotent; rolling back the tool does not
  require deleting indexed data.
- To abandon a run, stop the process and delete its checkpoint row. Re-running
  the same command recreates the run from `start_ledger` and upserts safely.
- To fully revert, drop the index records for the affected `contract_id` and
  ledger range, then remove the checkpoint.

## 8. Tests

Required test coverage:

- **Success:** a valid bounded range indexes all events and commits a final
  checkpoint at `end_ledger`.
- **Boundary:** single-ledger range (`start == end`); `span == MAX_SPAN`
  accepted; `span == MAX_SPAN + 1` rejected with `RangeTooLarge`.
- **Unauthorized:** missing/invalid credentials for the event source fail
  without advancing the checkpoint.
- **Replay:** re-running a completed run produces no duplicate index records
  and no checkpoint regression.
- **Failure:** a crash mid-batch leaves the checkpoint at the previous ledger
  and the batch is retried on restart.
- **Property:** for any valid range, `resume_from` after a committed checkpoint
  equals `last_committed_ledger + 1` and never exceeds `end_ledger + 1`.
