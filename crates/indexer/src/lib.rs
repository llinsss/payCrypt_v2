//! Indexer backfill tooling with bounded ranges.
//!
//! This module provides a typed, deterministic backfill runner that processes
//! event ranges in bounded chunks. Progress is persisted as checkpoints so that
//! runs are idempotent and can resume after a crash without reprocessing or
//! skipping ranges.

use std::collections::BTreeMap;
use std::fmt;

/// A bounded, inclusive range of ledgers to backfill.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LedgerRange {
    pub start: u64,
    pub end: u64,
}

impl LedgerRange {
    /// Construct a validated range. `start` must be `<= end`.
    pub fn new(start: u64, end: u64) -> Result<Self, BackfillError> {
        if start > end {
            return Err(BackfillError::InvalidRange { start, end });
        }
        Ok(Self { start, end })
    }

    /// Number of ledgers covered by this range (inclusive).
    pub fn len(&self) -> u64 {
        self.end - self.start + 1
    }

    pub fn is_empty(&self) -> bool {
        false
    }

    /// Split this range into bounded chunks of at most `chunk_size` ledgers.
    /// Deterministic: chunks are produced in ascending order.
    pub fn chunks(&self, chunk_size: u64) -> Result<Vec<LedgerRange>, BackfillError> {
        if chunk_size == 0 {
            return Err(BackfillError::InvalidChunkSize);
        }
        let mut out = Vec::new();
        let mut cursor = self.start;
        loop {
            let end = cursor.saturating_add(chunk_size - 1).min(self.end);
            out.push(LedgerRange { start: cursor, end });
            if end == self.end {
                break;
            }
            cursor = end + 1;
        }
        Ok(out)
    }
}

/// Errors surfaced by the backfill tooling.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackfillError {
    InvalidRange { start: u64, end: u64 },
    InvalidChunkSize,
    Persistence(String),
    Indexer(String),
}

impl fmt::Display for BackfillError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BackfillError::InvalidRange { start, end } => {
                write!(f, "invalid range: start {start} > end {end}")
            }
            BackfillError::InvalidChunkSize => write!(f, "chunk size must be > 0"),
            BackfillError::Persistence(msg) => write!(f, "persistence error: {msg}"),
            BackfillError::Indexer(msg) => write!(f, "indexer error: {msg}"),
        }
    }
}

impl std::error::Error for BackfillError {}

/// Persisted progress for a backfill run.
///
/// `last_committed` is the highest ledger whose events have been fully indexed
/// and durably committed. A run resumes strictly after this ledger.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BackfillCheckpoint {
    pub last_committed: Option<u64>,
    pub ranges_processed: u64,
    pub events_indexed: u64,
    pub failures: u64,
}

/// Durable store for backfill checkpoints.
pub trait CheckpointStore {
    fn load(&self) -> Result<BackfillCheckpoint, BackfillError>;
    fn save(&self, checkpoint: &BackfillCheckpoint) -> Result<(), BackfillError>;
}

/// In-memory checkpoint store, useful for tests and local runs.
#[derive(Debug, Default)]
pub struct MemoryCheckpointStore {
    inner: std::cell::RefCell<BackfillCheckpoint>,
}

impl MemoryCheckpointStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CheckpointStore for MemoryCheckpointStore {
    fn load(&self) -> Result<BackfillCheckpoint, BackfillError> {
        Ok(self.inner.borrow().clone())
    }

    fn save(&self, checkpoint: &BackfillCheckpoint) -> Result<(), BackfillError> {
        *self.inner.borrow_mut() = checkpoint.clone();
        Ok(())
    }
}

/// Operational metrics emitted by a backfill run.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BackfillMetrics {
    pub ranges_processed: u64,
    pub events_indexed: u64,
    pub failures: u64,
    /// Highest ledger committed so far; used to compute lag against the target.
    pub last_committed: Option<u64>,
}

impl BackfillMetrics {
    /// Lag in ledgers between the target end and the last committed ledger.
    pub fn lag(&self, target_end: u64) -> u64 {
        match self.last_committed {
            Some(last) if last < target_end => target_end - last,
            _ => 0,
        }
    }
}

/// Sink that indexes events for a single bounded range.
///
/// Implementations must be idempotent for a given range: re-indexing an already
/// committed range must not double-count events.
pub trait RangeIndexer {
    /// Index all events in `range`, returning the number of events indexed.
    fn index_range(&mut self, range: LedgerRange) -> Result<u64, BackfillError>;
}

/// Configuration for a backfill run.
#[derive(Debug, Clone, Copy)]
pub struct BackfillConfig {
    pub chunk_size: u64,
}

impl Default for BackfillConfig {
    fn default() -> Self {
        Self { chunk_size: 1_000 }
    }
}

/// Drives a bounded backfill, persisting checkpoints after each committed range.
///
/// Crash recovery: on start, the runner loads the last committed checkpoint and
/// resumes from the next ledger, so committed ranges are never reprocessed and
/// uncommitted ranges are never skipped.
pub struct BackfillRunner<S, I> {
    store: S,
    indexer: I,
    config: BackfillConfig,
}

impl<S: CheckpointStore, I: RangeIndexer> BackfillRunner<S, I> {
    pub fn new(store: S, indexer: I, config: BackfillConfig) -> Self {
        Self { store, indexer, config }
    }

    /// Run the backfill over `target`, resuming from the persisted checkpoint.
    /// Returns the final metrics for the run.
    pub fn run(&mut self, target: LedgerRange) -> Result<BackfillMetrics, BackfillError> {
        let mut checkpoint = self.store.load()?;

        // Resume strictly after the last committed ledger.
        let resume_from = match checkpoint.last_committed {
            Some(last) if last >= target.start => last + 1,
            _ => target.start,
        };

        if resume_from > target.end {
            return Ok(metrics_from(&checkpoint, target.end));
        }

        let remaining = LedgerRange::new(resume_from, target.end)?;
        for chunk in remaining.chunks(self.config.chunk_size)? {
            match self.indexer.index_range(chunk) {
                Ok(events) => {
                    checkpoint.events_indexed += events;
                    checkpoint.ranges_processed += 1;
                    checkpoint.last_committed = Some(chunk.end);
                    // Commit progress only after the range is fully indexed.
                    self.store.save(&checkpoint)?;
                }
                Err(err) => {
                    checkpoint.failures += 1;
                    // Persist failure count but do not advance last_committed,
                    // so the failed range is retried on the next run.
                    self.store.save(&checkpoint)?;
                    return Err(err);
                }
            }
        }

        Ok(metrics_from(&checkpoint, target.end))
    }
}

fn metrics_from(checkpoint: &BackfillCheckpoint, target_end: u64) -> BackfillMetrics {
    let metrics = BackfillMetrics {
        ranges_processed: checkpoint.ranges_processed,
        events_indexed: checkpoint.events_indexed,
        failures: checkpoint.failures,
        last_committed: checkpoint.last_committed,
    };
    let _ = metrics.lag(target_end);
    metrics
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_inverted_range() {
        assert_eq!(
            LedgerRange::new(10, 5),
            Err(BackfillError::InvalidRange { start: 10, end: 5 })
        );
    }

    #[test]
    fn chunks_are_bounded_and_deterministic() {
        let range = LedgerRange::new(1, 10).unwrap();
        let chunks = range.chunks(4).unwrap();
        assert_eq!(
            chunks,
            vec![
                LedgerRange { start: 1, end: 4 },
                LedgerRange { start: 5, end: 8 },
                LedgerRange { start: 9, end: 10 },
            ]
        );
    }

    #[test]
    fn rejects_zero_chunk_size() {
        let range = LedgerRange::new(1, 10).unwrap();
        assert_eq!(range.chunks(0), Err(BackfillError::InvalidChunkSize));
    }

    struct CountingIndexer {
        seen: BTreeMap<u64, u64>,
        fail_on: Option<u64>,
    }

    impl RangeIndexer for CountingIndexer {
        fn index_range(&mut self, range: LedgerRange) -> Result<u64, BackfillError> {
            if self.fail_on == Some(range.start) {
                return Err(BackfillError::Indexer("boom".into()));
            }
            let count = range.len();
            self.seen.insert(range.start, count);
            Ok(count)
        }
    }

    #[test]
    fn backfill_indexes_all_ranges_and_reports_metrics() {
        let store = MemoryCheckpointStore::new();
        let indexer = CountingIndexer { seen: BTreeMap::new(), fail_on: None };
        let mut runner = BackfillRunner::new(store, indexer, BackfillConfig { chunk_size: 4 });
        let metrics = runner.run(LedgerRange::new(1, 10).unwrap()).unwrap();
        assert_eq!(metrics.ranges_processed, 3);
        assert_eq!(metrics.events_indexed, 10);
        assert_eq!(metrics.failures, 0);
        assert_eq!(metrics.last_committed, Some(10));
        assert_eq!(metrics.lag(10), 0);
    }

    #[test]
    fn resumes_from_checkpoint_without_reprocessing() {
        let store = MemoryCheckpointStore::new();
        store
            .save(&BackfillCheckpoint {
                last_committed: Some(4),
                ranges_processed: 1,
                events_indexed: 4,
                failures: 0,
            })
            .unwrap();
        let indexer = CountingIndexer { seen: BTreeMap::new(), fail_on: None };
        let mut runner = BackfillRunner::new(store, indexer, BackfillConfig { chunk_size: 4 });
        let metrics = runner.run(LedgerRange::new(1, 10).unwrap()).unwrap();
        // Only ledgers 5..=10 are processed on resume.
        assert_eq!(metrics.events_indexed, 10);
        assert_eq!(metrics.ranges_processed, 3);
        assert_eq!(metrics.last_committed, Some(10));
    }

    #[test]
    fn failure_does_not_advance_checkpoint_and_is_retried() {
        let store = MemoryCheckpointStore::new();
        let indexer = CountingIndexer { seen: BTreeMap::new(), fail_on: Some(5) };
        let mut runner = BackfillRunner::new(store, indexer, BackfillConfig { chunk_size: 4 });
        let err = runner.run(LedgerRange::new(1, 10).unwrap()).unwrap_err();
        assert!(matches!(err, BackfillError::Indexer(_)));

        // Checkpoint reflects the committed first range only.
        let checkpoint = runner.store.load().unwrap();
        assert_eq!(checkpoint.last_committed, Some(4));
        assert_eq!(checkpoint.failures, 1);
    }

    #[test]
    fn replay_is_idempotent() {
        let store = MemoryCheckpointStore::new();
        let indexer = CountingIndexer { seen: BTreeMap::new(), fail_on: None };
        let mut runner = BackfillRunner::new(store, indexer, BackfillConfig { chunk_size: 4 });
        let target = LedgerRange::new(1, 10).unwrap();
        let first = runner.run(target).unwrap();
        let second = runner.run(target).unwrap();
        // Re-running a completed backfill is a no-op.
        assert_eq!(first.events_indexed, second.events_indexed);
        assert_eq!(second.ranges_processed, first.ranges_processed);
    }
}
