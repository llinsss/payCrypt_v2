//! Indexer checkpoint recovery.
//!
//! Provides a durable, idempotent checkpoint store that records the last
//! successfully processed ledger/event cursor. On restart the indexer resumes
//! deterministically from the last committed checkpoint, and replays are
//! rejected so state is never double-applied.

use std::collections::BTreeMap;
use std::fmt;

/// A cursor into the indexed stream: the last fully processed ledger and the
/// number of events consumed within that ledger.
pub type Ledger = u32;
pub type EventIndex = u32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Checkpoint {
    pub ledger: Ledger,
    pub event_index: EventIndex,
}

impl Checkpoint {
    pub const fn new(ledger: Ledger, event_index: EventIndex) -> Self {
        Self { ledger, event_index }
    }

    /// The genesis cursor: nothing has been processed yet.
    pub const fn genesis() -> Self {
        Self { ledger: 0, event_index: 0 }
    }

    /// Returns the next cursor after successfully processing one event.
    pub const fn advance(self) -> Self {
        Self { ledger: self.ledger, event_index: self.event_index + 1 }
    }

    /// Returns the cursor at the start of the given ledger.
    pub const fn at_ledger(ledger: Ledger) -> Self {
        Self { ledger, event_index: 0 }
    }
}

impl fmt::Display for Checkpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.ledger, self.event_index)
    }
}

/// Errors surfaced by the checkpoint store.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckpointError {
    /// A write attempted to move the cursor backwards (replay / stale writer).
    StaleWrite { committed: Checkpoint, attempted: Checkpoint },
    /// The persisted checkpoint could not be decoded.
    Corrupt(String),
}

impl fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CheckpointError::StaleWrite { committed, attempted } => write!(
                f,
                "stale checkpoint write: committed {committed}, attempted {attempted}"
            ),
            CheckpointError::Corrupt(msg) => write!(f, "corrupt checkpoint: {msg}"),
        }
    }
}

impl std::error::Error for CheckpointError {}

/// Durable checkpoint persistence.
///
/// Implementations must guarantee that a committed checkpoint survives a
/// crash and that [`CheckpointStore::commit`] is idempotent: committing the
/// same cursor twice is a no-op, and committing an older cursor is rejected.
pub trait CheckpointStore {
    /// Loads the last committed checkpoint, or [`Checkpoint::genesis`] if none.
    fn load(&self) -> Result<Checkpoint, CheckpointError>;

    /// Atomically persists `checkpoint` if it is newer than the committed one.
    fn commit(&mut self, checkpoint: Checkpoint) -> Result<(), CheckpointError>;
}

/// In-memory reference store used for tests and local networks.
///
/// Writes are monotonic and idempotent, mirroring the durability contract of a
/// real backing store (e.g. a database row updated in a single transaction).
#[derive(Debug, Default, Clone)]
pub struct MemoryCheckpointStore {
    committed: Checkpoint,
    /// Append-only journal of accepted checkpoints, useful for recovery tests.
    journal: BTreeMap<Checkpoint, ()>,
}

impl MemoryCheckpointStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Rebuilds a store from a journal, as a crash-recovery replay would.
    pub fn from_journal(journal: impl IntoIterator<Item = Checkpoint>) -> Self {
        let mut store = Self::new();
        for cp in journal {
            // Ignore stale entries during recovery; the newest wins.
            let _ = store.commit(cp);
        }
        store
    }

    pub fn journal(&self) -> impl Iterator<Item = Checkpoint> + '_ {
        self.journal.keys().copied()
    }
}

impl CheckpointStore for MemoryCheckpointStore {
    fn load(&self) -> Result<Checkpoint, CheckpointError> {
        Ok(self.committed)
    }

    fn commit(&mut self, checkpoint: Checkpoint) -> Result<(), CheckpointError> {
        if checkpoint < self.committed {
            return Err(CheckpointError::StaleWrite {
                committed: self.committed,
                attempted: checkpoint,
            });
        }
        // Idempotent: re-committing the current cursor is a no-op.
        if checkpoint == self.committed {
            return Ok(());
        }
        self.committed = checkpoint;
        self.journal.insert(checkpoint, ());
        Ok(())
    }
}

/// Drives indexing while advancing the checkpoint only after each event is
/// successfully processed. Guarantees at-least-once delivery with idempotent
/// checkpointing, so a crash mid-batch resumes from the last committed cursor.
pub struct Indexer<S: CheckpointStore> {
    store: S,
    cursor: Checkpoint,
}

impl<S: CheckpointStore> Indexer<S> {
    /// Resumes from the last committed checkpoint (crash recovery).
    pub fn resume(store: S) -> Result<Self, CheckpointError> {
        let cursor = store.load()?;
        Ok(Self { store, cursor })
    }

    pub fn cursor(&self) -> Checkpoint {
        self.cursor
    }

    /// Processes a single event and commits the advanced cursor.
    ///
    /// If `process` fails, the cursor is left untouched so the event is retried
    /// on the next run. If the commit fails, the in-memory cursor is rolled back
    /// to stay consistent with durable state.
    pub fn process_event<E, F>(&mut self, process: F) -> Result<Checkpoint, ProcessError<E>>
    where
        F: FnOnce(Checkpoint) -> Result<(), E>,
    {
        let next = self.cursor.advance();
        process(self.cursor).map_err(ProcessError::Handler)?;
        if let Err(err) = self.store.commit(next) {
            return Err(ProcessError::Checkpoint(err));
        }
        self.cursor = next;
        Ok(next)
    }

    /// Processes a whole ledger's events, committing after each one.
    pub fn process_ledger<E, F>(
        &mut self,
        ledger: Ledger,
        events: &[E],
        mut process: F,
    ) -> Result<Checkpoint, ProcessError<E>>
    where
        F: FnMut(Checkpoint, &E) -> Result<(), E>,
    {
        // Align the cursor to the ledger being processed.
        if ledger > self.cursor.ledger {
            let start = Checkpoint::at_ledger(ledger);
            self.store
                .commit(start)
                .map_err(ProcessError::Checkpoint)?;
            self.cursor = start;
        }
        for event in events {
            self.process_event(|cp| process(cp, event))?;
        }
        Ok(self.cursor)
    }
}

/// Failure modes when processing events.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProcessError<E> {
    /// The event handler rejected the event; the cursor was not advanced.
    Handler(E),
    /// The checkpoint could not be persisted; the cursor was not advanced.
    Checkpoint(CheckpointError),
}

impl<E: fmt::Display> fmt::Display for ProcessError<E> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProcessError::Handler(e) => write!(f, "event handler failed: {e}"),
            ProcessError::Checkpoint(e) => write!(f, "checkpoint commit failed: {e}"),
        }
    }
}

/// Operational metrics emitted by the indexer for monitoring.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct IndexerMetrics {
    pub events_processed: u64,
    pub events_failed: u64,
    pub checkpoints_committed: u64,
    pub stale_writes_rejected: u64,
    pub recoveries: u64,
}

impl IndexerMetrics {
    pub fn record_processed(&mut self) {
        self.events_processed += 1;
        self.checkpoints_committed += 1;
    }

    pub fn record_failure(&mut self) {
        self.events_failed += 1;
    }

    pub fn record_stale_write(&mut self) {
        self.stale_writes_rejected += 1;
    }

    pub fn record_recovery(&mut self) {
        self.recoveries += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commit_is_idempotent() {
        let mut store = MemoryCheckpointStore::new();
        let cp = Checkpoint::new(10, 3);
        store.commit(cp).unwrap();
        store.commit(cp).unwrap();
        assert_eq!(store.load().unwrap(), cp);
        assert_eq!(store.journal().count(), 1);
    }

    #[test]
    fn stale_write_is_rejected() {
        let mut store = MemoryCheckpointStore::new();
        store.commit(Checkpoint::new(10, 3)).unwrap();
        let err = store.commit(Checkpoint::new(9, 0)).unwrap_err();
        assert!(matches!(err, CheckpointError::StaleWrite { .. }));
        assert_eq!(store.load().unwrap(), Checkpoint::new(10, 3));
    }

    #[test]
    fn resumes_from_last_committed_checkpoint() {
        let mut store = MemoryCheckpointStore::new();
        store.commit(Checkpoint::new(42, 7)).unwrap();
        let indexer = Indexer::resume(store).unwrap();
        assert_eq!(indexer.cursor(), Checkpoint::new(42, 7));
    }

    #[test]
    fn crash_recovery_replays_journal_deterministically() {
        let journal = [
            Checkpoint::new(1, 0),
            Checkpoint::new(1, 1),
            Checkpoint::new(2, 0),
            Checkpoint::new(1, 5), // stale, ignored
        ];
        let store = MemoryCheckpointStore::from_journal(journal);
        assert_eq!(store.load().unwrap(), Checkpoint::new(2, 0));
    }

    #[test]
    fn cursor_advances_only_after_success() {
        let mut indexer = Indexer::resume(MemoryCheckpointStore::new()).unwrap();
        let ok: Result<(), ()> = Ok(());
        let cp = indexer.process_event(|_| ok).unwrap();
        assert_eq!(cp, Checkpoint::new(0, 1));

        let err = indexer.process_event(|_| Err("boom")).unwrap_err();
        assert_eq!(err, ProcessError::Handler("boom"));
        // Cursor unchanged after failure.
        assert_eq!(indexer.cursor(), Checkpoint::new(0, 1));
    }

    #[test]
    fn process_ledger_commits_each_event() {
        let mut indexer = Indexer::resume(MemoryCheckpointStore::new()).unwrap();
        let events = [10u32, 20, 30];
        let cp = indexer
            .process_ledger(5, &events, |_, _| Ok::<(), ()>(()))
            .unwrap();
        assert_eq!(cp, Checkpoint::new(5, 3));
    }

    #[test]
    fn metrics_track_activity() {
        let mut m = IndexerMetrics::default();
        m.record_processed();
        m.record_failure();
        m.record_stale_write();
        m.record_recovery();
        assert_eq!(m.events_processed, 1);
        assert_eq!(m.events_failed, 1);
        assert_eq!(m.stale_writes_rejected, 1);
        assert_eq!(m.recoveries, 1);
    }
}
