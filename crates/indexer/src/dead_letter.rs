//! Dead-letter storage for indexer events that fail deterministic validation.
//!
//! This module provides a durable, idempotent store for events that could not be
//! ingested. Entries are keyed by a deterministic content hash so that replays or
//! duplicate writes never create duplicates. In-flight writes are tracked in a
//! pending journal so that a crash mid-write can be reconciled on restart.

use std::collections::BTreeMap;
use std::fmt;

/// Schema version for the on-disk dead-letter format.
///
/// Bump this whenever the serialized layout changes so that recovery can detect
/// and reject incompatible stores instead of silently misreading them.
pub const DEAD_LETTER_SCHEMA_VERSION: u32 = 1;

/// Reason an event was dead-lettered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeadLetterReason {
    /// The event failed deterministic validation.
    ValidationFailed(String),
    /// The event could not be decoded into a known type.
    DecodeFailed(String),
    /// The event was rejected by an authorization check.
    Unauthorized(String),
}

impl fmt::Display for DeadLetterReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeadLetterReason::ValidationFailed(m) => write!(f, "validation_failed: {m}"),
            DeadLetterReason::DecodeFailed(m) => write!(f, "decode_failed: {m}"),
            DeadLetterReason::Unauthorized(m) => write!(f, "unauthorized: {m}"),
        }
    }
}

/// A single dead-lettered indexer event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeadLetterEntry {
    /// Deterministic content hash used as the idempotency key.
    pub id: String,
    /// Ledger sequence the event originated from.
    pub ledger: u64,
    /// Raw event payload, preserved verbatim for later inspection/replay.
    pub payload: Vec<u8>,
    /// Why the event was dead-lettered.
    pub reason: DeadLetterReason,
    /// Number of times this entry has been observed (>= 1).
    pub attempts: u32,
}

impl DeadLetterEntry {
    /// Deterministically derive the idempotency key for an event.
    ///
    /// The key is a stable FNV-1a hash over the ledger, payload, and reason so
    /// that identical failures always map to the same entry.
    pub fn derive_id(ledger: u64, payload: &[u8], reason: &DeadLetterReason) -> String {
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        let mut mix = |bytes: &[u8]| {
            for b in bytes {
                hash ^= *b as u64;
                hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
            }
        };
        mix(&ledger.to_be_bytes());
        mix(payload);
        mix(reason.to_string().as_bytes());
        format!("dl-{ledger}-{hash:016x}")
    }

    /// Construct a new entry, deriving its deterministic id.
    pub fn new(ledger: u64, payload: Vec<u8>, reason: DeadLetterReason) -> Self {
        let id = Self::derive_id(ledger, &payload, &reason);
        Self { id, ledger, payload, reason, attempts: 1 }
    }
}

/// Errors surfaced by the dead-letter store.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeadLetterError {
    /// The store was written with an incompatible schema version.
    SchemaMismatch { found: u32, expected: u32 },
    /// A pending write referenced an entry that was never committed.
    DanglingPending(String),
}

impl fmt::Display for DeadLetterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeadLetterError::SchemaMismatch { found, expected } => {
                write!(f, "dead-letter schema mismatch: found {found}, expected {expected}")
            }
            DeadLetterError::DanglingPending(id) => {
                write!(f, "dangling pending dead-letter write: {id}")
            }
        }
    }
}

/// Operational counters exposed by the store.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DeadLetterMetrics {
    /// Total entries currently stored.
    pub stored: u64,
    /// Writes that were deduplicated because the id already existed.
    pub duplicates: u64,
    /// Pending writes reconciled during crash recovery.
    pub recovered: u64,
}

/// Durable, idempotent dead-letter store.
///
/// The store keeps committed entries in `entries` and tracks in-flight writes in
/// `pending`. A write is only durable once it is committed; if the process dies
/// between `begin_write` and `commit`, `recover` reconciles the pending journal.
#[derive(Debug, Clone)]
pub struct DeadLetterStore {
    schema_version: u32,
    entries: BTreeMap<String, DeadLetterEntry>,
    pending: BTreeMap<String, DeadLetterEntry>,
    metrics: DeadLetterMetrics,
}

impl Default for DeadLetterStore {
    fn default() -> Self {
        Self::new()
    }
}

impl DeadLetterStore {
    /// Create an empty store at the current schema version.
    pub fn new() -> Self {
        Self {
            schema_version: DEAD_LETTER_SCHEMA_VERSION,
            entries: BTreeMap::new(),
            pending: BTreeMap::new(),
            metrics: DeadLetterMetrics::default(),
        }
    }

    /// Rehydrate a store from a persisted snapshot, validating the schema.
    pub fn from_snapshot(
        schema_version: u32,
        entries: Vec<DeadLetterEntry>,
    ) -> Result<Self, DeadLetterError> {
        if schema_version != DEAD_LETTER_SCHEMA_VERSION {
            return Err(DeadLetterError::SchemaMismatch {
                found: schema_version,
                expected: DEAD_LETTER_SCHEMA_VERSION,
            });
        }
        let mut store = Self::new();
        for entry in entries {
            store.entries.insert(entry.id.clone(), entry);
        }
        store.metrics.stored = store.entries.len() as u64;
        Ok(store)
    }

    /// Current schema version of this store.
    pub fn schema_version(&self) -> u32 {
        self.schema_version
    }

    /// Begin an in-flight write. The entry is not durable until `commit`.
    pub fn begin_write(&mut self, entry: DeadLetterEntry) {
        self.pending.insert(entry.id.clone(), entry);
    }

    /// Commit a previously begun write.
    ///
    /// Idempotent: committing an id that already exists increments the attempt
    /// counter and records a duplicate instead of inserting a second entry.
    pub fn commit(&mut self, id: &str) -> Result<(), DeadLetterError> {
        let mut entry = self
            .pending
            .remove(id)
            .ok_or_else(|| DeadLetterError::DanglingPending(id.to_string()))?;
        match self.entries.get_mut(id) {
            Some(existing) => {
                existing.attempts = existing.attempts.saturating_add(1);
                self.metrics.duplicates += 1;
            }
            None => {
                entry.attempts = entry.attempts.max(1);
                self.entries.insert(id.to_string(), entry);
                self.metrics.stored += 1;
            }
        }
        Ok(())
    }

    /// Convenience: write an entry atomically (begin + commit).
    ///
    /// Returns `true` if a new entry was stored, `false` if it was a duplicate.
    pub fn write(&mut self, entry: DeadLetterEntry) -> Result<bool, DeadLetterError> {
        let id = entry.id.clone();
        let is_new = !self.entries.contains_key(&id);
        self.begin_write(entry);
        self.commit(&id)?;
        Ok(is_new)
    }

    /// Reconcile in-flight writes after a crash.
    ///
    /// Any pending write that never committed is re-committed so no dead-letter
    /// is lost. Returns the number of entries recovered.
    pub fn recover(&mut self) -> Result<u64, DeadLetterError> {
        let pending: Vec<String> = self.pending.keys().cloned().collect();
        let mut recovered = 0u64;
        for id in pending {
            self.commit(&id)?;
            recovered += 1;
        }
        self.metrics.recovered += recovered;
        Ok(recovered)
    }

    /// Look up a stored entry by id.
    pub fn get(&self, id: &str) -> Option<&DeadLetterEntry> {
        self.entries.get(id)
    }

    /// Number of committed entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the store holds no committed entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Snapshot of committed entries for persistence.
    pub fn snapshot(&self) -> Vec<DeadLetterEntry> {
        self.entries.values().cloned().collect()
    }

    /// Current operational metrics.
    pub fn metrics(&self) -> DeadLetterMetrics {
        self.metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(ledger: u64, payload: &[u8]) -> DeadLetterEntry {
        DeadLetterEntry::new(ledger, payload.to_vec(), DeadLetterReason::ValidationFailed("bad".into()))
    }

    #[test]
    fn write_stores_entry() {
        let mut store = DeadLetterStore::new();
        assert!(store.write(entry(1, b"a")).unwrap());
        assert_eq!(store.len(), 1);
        assert_eq!(store.metrics().stored, 1);
    }

    #[test]
    fn duplicate_write_is_idempotent() {
        let mut store = DeadLetterStore::new();
        assert!(store.write(entry(1, b"a")).unwrap());
        assert!(!store.write(entry(1, b"a")).unwrap());
        assert_eq!(store.len(), 1);
        assert_eq!(store.metrics().duplicates, 1);
        let id = DeadLetterEntry::derive_id(1, b"a", &DeadLetterReason::ValidationFailed("bad".into()));
        assert_eq!(store.get(&id).unwrap().attempts, 2);
    }

    #[test]
    fn distinct_payloads_are_distinct() {
        let mut store = DeadLetterStore::new();
        store.write(entry(1, b"a")).unwrap();
        store.write(entry(1, b"b")).unwrap();
        assert_eq!(store.len(), 2);
    }

    #[test]
    fn crash_recovery_reconciles_pending() {
        let mut store = DeadLetterStore::new();
        let e = entry(7, b"x");
        let id = e.id.clone();
        store.begin_write(e);
        assert!(store.get(&id).is_none());
        assert_eq!(store.recover().unwrap(), 1);
        assert!(store.get(&id).is_some());
        assert_eq!(store.metrics().recovered, 1);
    }

    #[test]
    fn commit_without_begin_fails() {
        let mut store = DeadLetterStore::new();
        assert_eq!(store.commit("missing"), Err(DeadLetterError::DanglingPending("missing".into())));
    }

    #[test]
    fn snapshot_roundtrip_validates_schema() {
        let mut store = DeadLetterStore::new();
        store.write(entry(3, b"z")).unwrap();
        let restored = DeadLetterStore::from_snapshot(store.schema_version(), store.snapshot()).unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored.metrics().stored, 1);
        assert!(matches!(
            DeadLetterStore::from_snapshot(999, store.snapshot()),
            Err(DeadLetterError::SchemaMismatch { .. })
        ));
    }

    #[test]
    fn derive_id_is_deterministic() {
        let r = DeadLetterReason::Unauthorized("nope".into());
        assert_eq!(DeadLetterEntry::derive_id(5, b"p", &r), DeadLetterEntry::derive_id(5, b"p", &r));
        assert_ne!(DeadLetterEntry::derive_id(5, b"p", &r), DeadLetterEntry::derive_id(6, b"p", &r));
    }
}
