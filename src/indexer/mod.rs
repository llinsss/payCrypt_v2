//! Durable event indexer for Soroban payments.
//!
//! Ingests tag, escrow, wallet, and payment contract events and persists
//! normalized records. Ingestion is idempotent: each event is keyed by a
//! deterministic event key (contract + ledger + transaction + event index),
//! so replaying the same ledger range never produces duplicate rows.
//!
//! Failed ingestion attempts are tracked with retry and dead-letter metrics.

use std::collections::HashMap;
use std::fmt;

/// Schema version persisted alongside every normalized record.
///
/// Bump this whenever the normalized record layout changes so downstream
/// consumers can migrate deterministically.
pub const SCHEMA_VERSION: u32 = 1;

/// Maximum number of ingestion attempts before an event is dead-lettered.
pub const MAX_INGEST_ATTEMPTS: u32 = 5;

/// The kind of Soroban event this indexer understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EventKind {
    Tag,
    Escrow,
    Wallet,
    Payment,
}

impl EventKind {
    /// Map a raw contract event topic to a known [`EventKind`].
    ///
    /// Returns `None` for topics this indexer does not normalize.
    pub fn from_topic(topic: &str) -> Option<Self> {
        match topic {
            "tag" => Some(EventKind::Tag),
            "escrow" => Some(EventKind::Escrow),
            "wallet" => Some(EventKind::Wallet),
            "payment" => Some(EventKind::Payment),
            _ => None,
        }
    }

    /// Stable string form used when building the deterministic event key.
    pub fn as_str(&self) -> &'static str {
        match self {
            EventKind::Tag => "tag",
            EventKind::Escrow => "escrow",
            EventKind::Wallet => "wallet",
            EventKind::Payment => "payment",
        }
    }
}

/// A raw event as observed on-chain, before normalization.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawEvent {
    pub contract_id: String,
    pub ledger_sequence: u32,
    pub transaction_hash: String,
    /// Position of the event within its transaction; part of the event key.
    pub event_index: u32,
    /// Raw event topics, in order.
    pub topics: Vec<String>,
    /// Raw event payload (opaque to the indexer).
    pub data: String,
}

/// A normalized, persistable event record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedEvent {
    /// Deterministic, idempotent key: contract + ledger + tx + event index.
    pub event_key: String,
    pub kind: EventKind,
    pub contract_id: String,
    pub ledger_sequence: u32,
    pub transaction_hash: String,
    pub event_index: u32,
    pub topics: Vec<String>,
    pub data: String,
    pub schema_version: u32,
}

impl NormalizedEvent {
    /// Build the deterministic event key used for idempotent ingestion.
    pub fn event_key(
        contract_id: &str,
        ledger_sequence: u32,
        transaction_hash: &str,
        event_index: u32,
    ) -> String {
        format!(
            "{contract_id}:{ledger_sequence}:{transaction_hash}:{event_index}"
        )
    }

    /// Normalize a raw event, returning `None` for unsupported topics.
    pub fn from_raw(raw: &RawEvent) -> Option<Self> {
        let topic = raw.topics.first()?;
        let kind = EventKind::from_topic(topic)?;
        Some(NormalizedEvent {
            event_key: Self::event_key(
                &raw.contract_id,
                raw.ledger_sequence,
                &raw.transaction_hash,
                raw.event_index,
            ),
            kind,
            contract_id: raw.contract_id.clone(),
            ledger_sequence: raw.ledger_sequence,
            transaction_hash: raw.transaction_hash.clone(),
            event_index: raw.event_index,
            topics: raw.topics.clone(),
            data: raw.data.clone(),
            schema_version: SCHEMA_VERSION,
        })
    }
}

/// Errors surfaced while persisting a normalized event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IngestError {
    /// The backing store rejected the write (transient or permanent).
    Store(String),
}

impl fmt::Display for IngestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IngestError::Store(msg) => write!(f, "store error: {msg}"),
        }
    }
}

impl std::error::Error for IngestError {}

/// Durable persistence boundary for normalized events.
///
/// Implementations must make `insert` idempotent on `event_key` (e.g. an
/// upsert or a unique constraint) so replays are safe.
pub trait EventStore {
    fn insert(&mut self, event: &NormalizedEvent) -> Result<(), IngestError>;
}

/// Retry and dead-letter metrics exposed by the indexer.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IndexerMetrics {
    /// Total events successfully persisted.
    pub ingested: u64,
    /// Events skipped because their key was already present (idempotency).
    pub duplicates: u64,
    /// Total failed ingestion attempts, including retried ones.
    pub retries: u64,
    /// Events that exhausted [`MAX_INGEST_ATTEMPTS`] and were dead-lettered.
    pub dead_letters: u64,
}

/// A dead-lettered event retained for later inspection or replay.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeadLetter {
    pub event: NormalizedEvent,
    pub attempts: u32,
    pub last_error: String,
}

/// Durable indexer that normalizes and persists Soroban events.
pub struct EventIndexer<S: EventStore> {
    store: S,
    /// Keys already persisted, used to make ingestion idempotent.
    seen: HashMap<String, ()>,
    metrics: IndexerMetrics,
    dead_letters: Vec<DeadLetter>,
}

impl<S: EventStore> EventIndexer<S> {
    pub fn new(store: S) -> Self {
        EventIndexer {
            store,
            seen: HashMap::new(),
            metrics: IndexerMetrics::default(),
            dead_letters: Vec::new(),
        }
    }

    /// Current retry and dead-letter metrics.
    pub fn metrics(&self) -> &IndexerMetrics {
        &self.metrics
    }

    /// Events that exhausted their retry budget.
    pub fn dead_letters(&self) -> &[DeadLetter] {
        &self.dead_letters
    }

    /// Ingest a batch of raw events.
    ///
    /// Unsupported topics are ignored. Each supported event is normalized and
    /// persisted idempotently; failures are retried up to
    /// [`MAX_INGEST_ATTEMPTS`] before being dead-lettered.
    pub fn ingest(&mut self, raw_events: &[RawEvent]) {
        for raw in raw_events {
            let Some(event) = NormalizedEvent::from_raw(raw) else {
                continue;
            };
            self.ingest_one(event);
        }
    }

    fn ingest_one(&mut self, event: NormalizedEvent) {
        // Idempotency: skip events whose deterministic key was already stored.
        if self.seen.contains_key(&event.event_key) {
            self.metrics.duplicates += 1;
            return;
        }

        let mut attempts = 0;
        loop {
            attempts += 1;
            match self.store.insert(&event) {
                Ok(()) => {
                    self.seen.insert(event.event_key.clone(), ());
                    self.metrics.ingested += 1;
                    return;
                }
                Err(err) => {
                    self.metrics.retries += 1;
                    if attempts >= MAX_INGEST_ATTEMPTS {
                        self.metrics.dead_letters += 1;
                        self.dead_letters.push(DeadLetter {
                            event,
                            attempts,
                            last_error: err.to_string(),
                        });
                        return;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryStore {
        rows: Vec<NormalizedEvent>,
        fail_times: u32,
    }

    impl EventStore for MemoryStore {
        fn insert(&mut self, event: &NormalizedEvent) -> Result<(), IngestError> {
            if self.fail_times > 0 {
                self.fail_times -= 1;
                return Err(IngestError::Store("transient".into()));
            }
            // Idempotent on event_key.
            if !self.rows.iter().any(|r| r.event_key == event.event_key) {
                self.rows.push(event.clone());
            }
            Ok(())
        }
    }

    fn raw(kind: &str, index: u32) -> RawEvent {
        RawEvent {
            contract_id: "CABC".into(),
            ledger_sequence: 42,
            transaction_hash: "deadbeef".into(),
            event_index: index,
            topics: vec![kind.into(), "extra".into()],
            data: "payload".into(),
        }
    }

    #[test]
    fn normalizes_all_supported_kinds() {
        for kind in ["tag", "escrow", "wallet", "payment"] {
            let event = NormalizedEvent::from_raw(&raw(kind, 0)).unwrap();
            assert_eq!(event.schema_version, SCHEMA_VERSION);
            assert_eq!(event.contract_id, "CABC");
            assert_eq!(event.ledger_sequence, 42);
            assert_eq!(event.transaction_hash, "deadbeef");
            assert_eq!(event.topics.len(), 2);
        }
        assert!(NormalizedEvent::from_raw(&raw("unknown", 0)).is_none());
    }

    #[test]
    fn ingestion_is_idempotent() {
        let mut indexer = EventIndexer::new(MemoryStore::default());
        let events = vec![raw("payment", 0), raw("payment", 1)];
        indexer.ingest(&events);
        indexer.ingest(&events);
        assert_eq!(indexer.metrics().ingested, 2);
        assert_eq!(indexer.metrics().duplicates, 2);
    }

    #[test]
    fn retries_then_dead_letters() {
        let store = MemoryStore {
            rows: Vec::new(),
            fail_times: MAX_INGEST_ATTEMPTS,
        };
        let mut indexer = EventIndexer::new(store);
        indexer.ingest(&[raw("escrow", 0)]);
        assert_eq!(indexer.metrics().retries, MAX_INGEST_ATTEMPTS as u64);
        assert_eq!(indexer.metrics().dead_letters, 1);
        assert_eq!(indexer.dead_letters().len(), 1);
    }
}
