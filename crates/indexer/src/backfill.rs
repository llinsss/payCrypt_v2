//! Indexer backfill tooling with bounded ranges.
//!
//! This module provides a typed, deterministic backfill runner that indexes
//! events over a bounded ledger range. It supports:
//!
//! * Deterministic validation of range inputs (start/end ledger bounds).
//! * Persistence of progress checkpoints so runs are idempotent and resumable.
//! * Crash recovery: a run resumes from the last committed checkpoint without
//!   reprocessing or skipping ranges.
//! * Operational metrics for monitoring (ranges processed, events indexed,
//!   failures, lag).
//!
//! The runner is generic over a [`BackfillSource`] (the thing that actually
//! fetches events for a bounded range) and a [`CheckpointStore`] (the thing
//! that persists progress). This keeps the tooling testable and independent of
//! any particular storage backend.

use std::fmt;

/// A bounded, inclusive ledger range to backfill.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LedgerRange {
    /// First ledger in the range (inclusive).
    pub start: u64,
    /// Last ledger in the range (inclusive).
    pub end: u64,
}

impl LedgerRange {
    /// Construct a range, validating that `start <= end`.
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

    /// Whether the range is empty. Always `false` for a valid range.
    pub fn is_empty(&self) -> bool {
        false
    }

    /// Split this range into chunks of at most `chunk_size` ledgers.
    ///
    /// Returns an error if `chunk_size` is zero. The chunks are contiguous and
    /// cover the whole range exactly once, which is what makes backfill
    /// deterministic and idempotent.
    pub fn chunks(&self, chunk_size: u64) -> Result<Vec<LedgerRange>, BackfillError> {
        if chunk_size == 0 {
            return Err(BackfillError::InvalidChunkSize);
        }
        let mut chunks = Vec::new();
        let mut cursor = self.start;
        loop {
            let end = cursor.saturating_add(chunk_size - 1).min(self.end);
            chunks.push(LedgerRange { start: cursor, end });
            if end == self.end {
                break;
            }
            cursor = end + 1;
        }
        Ok(chunks)
    }
}

/// Errors produced by the backfill tooling.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackfillError {
    /// `start > end`.
    InvalidRange { start: u64, end: u64 },
    /// Chunk size must be greater than zero.
    InvalidChunkSize,
    /// The source failed to fetch events for a range.
    Source(String),
    /// The checkpoint store failed.
    Store(String),
}

impl fmt::Display for BackfillError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BackfillError::InvalidRange { start, end } => {
                write!(f, "invalid ledger range: start {start} > end {end}")
            }
            BackfillError::InvalidChunkSize => write!(f, "chunk size must be > 0"),
            BackfillError::Source(msg) => write!(f, "backfill source error: {msg}"),
            BackfillError::Store(msg) => write!(f, "checkpoint store error: {msg}"),
        }
    }
}

impl std::error::Error for BackfillError {}

/// A single indexed event. Kept intentionally small; the runner only needs to
/// count and forward events.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedEvent {
    /// Ledger the event was emitted in.
    pub ledger: u64,
    /// Opaque event payload identifier.
    pub id: String,
}

/// Source of events for a bounded ledger range.
///
/// Implementations must be deterministic: fetching the same range twice must
/// yield the same events. This is what allows idempotent replay.
pub trait BackfillSource {
    /// Fetch all events in `range`.
    fn fetch(&self, range: LedgerRange) -> Result<Vec<IndexedEvent>, BackfillError>;
}

/// Persisted progress for a backfill run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Checkpoint {
    /// Last ledger that was fully committed.
    pub last_committed: u64,
    /// Total events indexed so far.
    pub events_indexed: u64,
}

/// Durable store for backfill checkpoints.
///
/// A checkpoint must only be written *after* the corresponding range has been
/// fully indexed, so that a crash mid-range causes that range to be retried
/// rather than skipped.
pub trait CheckpointStore {
    /// Load the last committed checkpoint, if any.
    fn load(&self) -> Result<Option<Checkpoint>, BackfillError>;
    /// Persist a checkpoint durably.
    fn save(&mut self, checkpoint: Checkpoint) -> Result<(), BackfillError>;
}

/// Operational metrics emitted by a backfill run.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct BackfillMetrics {
    /// Number of bounded ranges processed (committed).
    pub ranges_processed: u64,
    /// Total events indexed across all ranges.
    pub events_indexed: u64,
    /// Number of ranges that failed and were retried.
    pub failures: u64,
    /// Ledgers remaining between the last committed ledger and the target end.
    pub lag: u64,
}

/// Outcome of a backfill run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackfillReport {
    /// Final checkpoint after the run.
    pub checkpoint: Checkpoint,
    /// Metrics collected during the run.
    pub metrics: BackfillMetrics,
}

/// Bounded-range backfill runner.
///
/// The runner walks a target [`LedgerRange`] in fixed-size chunks. For each
/// chunk it fetches events, forwards them to the sink, and only then commits a
/// checkpoint. If the process crashes, the next run resumes from the last
/// committed checkpoint, so ranges are neither reprocessed nor skipped.
pub struct BackfillRunner<S, C, F>
where
    S: BackfillSource,
    C: CheckpointStore,
    F: FnMut(&IndexedEvent),
{
    source: S,
    store: C,
    sink: F,
    chunk_size: u64,
}

impl<S, C, F> BackfillRunner<S, C, F>
where
    S: BackfillSource,
    C: CheckpointStore,
    F: FnMut(&IndexedEvent),
{
    /// Create a runner. `chunk_size` must be greater than zero.
    pub fn new(
        source: S,
        store: C,
        sink: F,
        chunk_size: u64,
    ) -> Result<Self, BackfillError> {
        if chunk_size == 0 {
            return Err(BackfillError::InvalidChunkSize);
        }
        Ok(Self {
            source,
            store,
            sink,
            chunk_size,
        })
    }

    /// Run the backfill over `target`, resuming from the last committed
    /// checkpoint if one exists.
    ///
    /// Returns a [`BackfillReport`] with the final checkpoint and metrics.
    pub fn run(&mut self, target: LedgerRange) -> Result<BackfillReport, BackfillError> {
        let mut checkpoint = self.store.load()?.unwrap_or(Checkpoint {
            last_committed: target.start.saturating_sub(1),
            events_indexed: 0,
        });

        let mut metrics = BackfillMetrics::default();

        // Resume point: the ledger immediately after the last committed one.
        let resume_from = checkpoint.last_committed.saturating_add(1);
        if resume_from > target.end {
            metrics.lag = 0;
            return Ok(BackfillReport { checkpoint, metrics });
        }

        let remaining = LedgerRange {
            start: resume_from.max(target.start),
            end: target.end,
        };

        for chunk in remaining.chunks(self.chunk_size)? {
            let events = self.source.fetch(chunk)?;
            for event in &events {
                (self.sink)(event);
            }

            checkpoint = Checkpoint {
                last_committed: chunk.end,
                events_indexed: checkpoint.events_indexed + events.len() as u64,
            };
            self.store.save(checkpoint)?;

            metrics.ranges_processed += 1;
            metrics.events_indexed += events.len() as u64;
            metrics.lag = target.end.saturating_sub(checkpoint.last_committed);
        }

        Ok(BackfillReport { checkpoint, metrics })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct MemSource {
        events: Vec<IndexedEvent>,
        fail_on: Option<u64>,
    }

    impl BackfillSource for MemSource {
        fn fetch(&self, range: LedgerRange) -> Result<Vec<IndexedEvent>, BackfillError> {
            if self.fail_on == Some(range.start) {
                return Err(BackfillError::Source("boom".into()));
            }
            Ok(self
                .events
                .iter()
                .filter(|e| e.ledger >= range.start && e.ledger <= range.end)
                .cloned()
                .collect())
        }
    }

    #[derive(Default)]
    struct MemStore {
        checkpoint: Option<Checkpoint>,
        saves: u64,
    }

    impl CheckpointStore for MemStore {
        fn load(&self) -> Result<Option<Checkpoint>, BackfillError> {
            Ok(self.checkpoint)
        }
        fn save(&mut self, checkpoint: Checkpoint) -> Result<(), BackfillError> {
            self.checkpoint = Some(checkpoint);
            self.saves += 1;
            Ok(())
        }
    }

    fn event(ledger: u64) -> IndexedEvent {
        IndexedEvent {
            ledger,
            id: format!("evt-{ledger}"),
        }
    }

    #[test]
    fn rejects_inverted_range() {
        assert_eq!(
            LedgerRange::new(10, 5),
            Err(BackfillError::InvalidRange { start: 10, end: 5 })
        );
    }

    #[test]
    fn chunks_cover_range_exactly_once() {
        let range = LedgerRange::new(1, 10).unwrap();
        let chunks = range.chunks(3).unwrap();
        assert_eq!(chunks.len(), 4);
        assert_eq!(chunks[0], LedgerRange { start: 1, end: 3 });
        assert_eq!(chunks[3], LedgerRange { start: 10, end: 10 });
        let total: u64 = chunks.iter().map(|c| c.len()).sum();
        assert_eq!(total, range.len());
    }

    #[test]
    fn rejects_zero_chunk_size() {
        let range = LedgerRange::new(1, 10).unwrap();
        assert_eq!(range.chunks(0), Err(BackfillError::InvalidChunkSize));
    }

    #[test]
    fn indexes_all_events_and_commits_checkpoints() {
        let source = MemSource {
            events: (1..=5).map(event).collect(),
            fail_on: None,
        };
        let store = MemStore::default();
        let seen = RefCell::new(Vec::new());
        let mut runner = BackfillRunner::new(source, store, |e: &IndexedEvent| {
            seen.borrow_mut().push(e.ledger);
        }, 2)
        .unwrap();

        let report = runner.run(LedgerRange::new(1, 5).unwrap()).unwrap();
        assert_eq!(report.checkpoint.last_committed, 5);
        assert_eq!(report.checkpoint.events_indexed, 5);
        assert_eq!(report.metrics.ranges_processed, 3);
        assert_eq!(report.metrics.events_indexed, 5);
        assert_eq!(report.metrics.lag, 0);
        assert_eq!(*seen.borrow(), vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn resumes_from_checkpoint_without_reprocessing() {
        let source = MemSource {
            events: (1..=6).map(event).collect(),
            fail_on: None,
        };
        let store = MemStore {
            checkpoint: Some(Checkpoint {
                last_committed: 3,
                events_indexed: 3,
            }),
            saves: 0,
        };
        let seen = RefCell::new(Vec::new());
        let mut runner = BackfillRunner::new(source, store, |e: &IndexedEvent| {
            seen.borrow_mut().push(e.ledger);
        }, 2)
        .unwrap();

        let report = runner.run(LedgerRange::new(1, 6).unwrap()).unwrap();
        assert_eq!(report.checkpoint.last_committed, 6);
        assert_eq!(report.checkpoint.events_indexed, 6);
        // Only ledgers 4..=6 are reprocessed, not 1..=3.
        assert_eq!(*seen.borrow(), vec![4, 5, 6]);
    }

    #[test]
    fn crash_mid_range_retries_that_range() {
        let source = MemSource {
            events: (1..=4).map(event).collect(),
            fail_on: Some(3),
        };
        let store = MemStore::default();
        let mut runner = BackfillRunner::new(source, store, |_e: &IndexedEvent| {}, 2).unwrap();

        let err = runner.run(LedgerRange::new(1, 4).unwrap()).unwrap_err();
        assert_eq!(err, BackfillError::Source("boom".into()));
        // The failing range was not committed, so it will be retried.
        assert_eq!(runner.store.checkpoint.unwrap().last_committed, 2);
    }

    #[test]
    fn already_complete_range_is_a_noop() {
        let source = MemSource::default();
        let store = MemStore {
            checkpoint: Some(Checkpoint {
                last_committed: 10,
                events_indexed: 10,
            }),
            saves: 0,
        };
        let mut runner = BackfillRunner::new(source, store, |_e: &IndexedEvent| {}, 5).unwrap();
        let report = runner.run(LedgerRange::new(1, 10).unwrap()).unwrap();
        assert_eq!(report.metrics.ranges_processed, 0);
        assert_eq!(report.metrics.lag, 0);
    }
}
