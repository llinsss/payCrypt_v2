//! Indexer checkpoint recovery.
//!
//! Provides a durable, idempotent checkpoint store that records the last
//! successfully processed ledger/event cursor. On restart the indexer resumes
//! deterministically from the last committed checkpoint, and replays are
//! rejected so state is never double-applied.
//!
//! Also provides a durable, idempotent dead-letter store for indexer events
//! that could not be processed, so failures are persisted for later inspection
//! and replay without blocking the main cursor.

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

/// Schema version for the dead-letter record format. Bump when the on-disk
/// representation changes so recovery can reject or migrate old records.
pub const DEAD_LETTER_SCHEMA_VERSION: u32 = 1;

/// A single dead-lettered indexer event: an event that could not be processed
/// and was persisted for later inspection or replay.
///
/// The `id` is a deterministic, caller-supplied key (e.g. a hash of the ledger,
/// event index, and payload) that makes writes idempotent: re-writing the same
/// `id` never creates a duplicate record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeadLetter {
    /// Schema version of this record, for forward/backward compatibility.
    pub schema_version: u32,
    /// Deterministic idempotency key for the dead-lettered event.
    pub id: String,
    /// The cursor at which the event was observed.
    pub checkpoint: Checkpoint,
    /// Human-readable reason the event was dead-lettered.
    pub reason: String,
    /// Opaque serialized event payload, retained for replay.
    pub payload: Vec<u8>,
    /// Monotonic sequence assigned on first durable write (0 until committed).
    pub sequence: u64,
}

impl DeadLetter {
    /// Builds a new dead-letter record with the current schema version.
    pub fn new(
        id: impl Into<String>,
        checkpoint: Checkpoint,
        reason: impl Into<String>,
        payload: impl Into<Vec<u8>>,
    ) -> Self {
        Self {
            schema_version: DEAD_LETTER_SCHEMA_VERSION,
            id: id.into(),
            checkpoint,
            reason: reason.into(),
            payload: payload.into(),
            sequence: 0,
        }
    }

    /// Deterministic validation of a record before it is persisted.
    ///
    /// Rejects empty ids, empty reasons, and records written with an unknown
    /// schema version so corrupt or incompatible entries never enter the store.
    pub fn validate(&self) -> Result<(), DeadLetterError> {
        if self.schema_version != DEAD_LETTER_SCHEMA_VERSION {
            return Err(DeadLetterError::UnsupportedSchema(self.schema_version));
        }
        if self.id.is_empty() {
            return Err(DeadLetterError::Invalid("empty id".into()));
        }
        if self.reason.is_empty() {
            return Err(DeadLetterError::Invalid("empty reason".into()));
        }
        Ok(())
    }
}

/// Errors surfaced by the dead-letter store.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeadLetterError {
    /// The record failed deterministic validation.
    Invalid(String),
    /// The record's schema version is not supported by this build.
    UnsupportedSchema(u32),
    /// The persisted dead-letter store could not be decoded.
    Corrupt(String),
}

impl fmt::Display for DeadLetterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeadLetterError::Invalid(msg) => write!(f, "invalid dead-letter: {msg}"),
            DeadLetterError::UnsupportedSchema(v) => {
                write!(f, "unsupported dead-letter schema version: {v}")
            }
            DeadLetterError::Corrupt(msg) => write!(f, "corrupt dead-letter store: {msg}"),
        }
    }
}

impl std::error::Error for DeadLetterError {}

/// Durable dead-letter persistence.
///
/// Implementations must guarantee that a committed dead-letter survives a
/// crash and that [`DeadLetterStore::put`] is idempotent: writing a record with
/// an `id` that already exists is a no-op and returns the existing sequence.
pub trait DeadLetterStore {
    /// Persists `record`, returning its durable sequence number.
    ///
    /// Idempotent on `record.id`: a duplicate write returns the sequence of the
    /// already-stored record without creating a second entry.
    fn put(&mut self, record: DeadLetter) -> Result<u64, DeadLetterError>;

    /// Loads a stored record by id, if present.
    fn get(&self, id: &str) -> Result<Option<DeadLetter>, DeadLetterError>;

    /// Returns the number of stored records.
    fn len(&self) -> usize;

    /// Returns `true` if no records are stored.
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// In-memory reference dead-letter store used for tests and local networks.
///
/// Writes are idempotent on `id` and assigned a monotonic sequence, mirroring
/// the durability contract of a real backing store (e.g. a table with a unique
/// constraint on the id column).
#[derive(Debug, Default, Clone)]
pub struct MemoryDeadLetterStore {
    records: BTreeMap<String, DeadLetter>,
    next_sequence: u64,
}

impl MemoryDeadLetterStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Rebuilds a store from a journal of records, as a crash-recovery replay
    /// would. Duplicate ids are collapsed, so recovery is idempotent.
    pub fn from_journal(journal: impl IntoIterator<Item = DeadLetter>) -> Self {
        let mut store = Self::new();
        for record in journal {
            // Ignore invalid or duplicate entries during recovery.
            let _ = store.put(record);
        }
        store
    }

    /// Iterates stored records in id order.
    pub fn records(&self) -> impl Iterator<Item = &DeadLetter> + '_ {
        self.records.values()
    }
}

impl DeadLetterStore for MemoryDeadLetterStore {
    fn put(&mut self, mut record: DeadLetter) -> Result<u64, DeadLetterError> {
        record.validate()?;
        // Idempotent: an existing id is returned unchanged, no duplicate.
        if let Some(existing) = self.records.get(&record.id) {
            return Ok(existing.sequence);
        }
        self.next_sequence += 1;
        record.sequence = self.next_sequence;
        let sequence = record.sequence;
        self.records.insert(record.id.clone(), record);
        Ok(sequence)
    }

    fn get(&self, id: &str) -> Result<Option<DeadLetter>, DeadLetterError> {
        Ok(self.records.get(id).cloned())
    }

    fn len(&self) -> usize {
        self.records.len()
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
    pub dead_letters_written: u64,
    pub dead_letters_deduplicated: u64,
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

    /// Records a newly persisted dead-letter record.
    pub fn record_dead_letter(&mut self) {
        self.dead_letters_written += 1;
    }

    /// Records a dead-letter write that was deduplicated by idempotency.
    pub fn record_dead_letter_dedup(&mut self) {
        self.dead_letters_deduplicated += 1;
    }
}
