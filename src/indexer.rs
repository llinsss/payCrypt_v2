//! Soroban tag event listener / indexer.
//!
//! Consumes tag registration, transfer, resolution, and recovery events emitted
//! by Soroban contracts and normalizes them into persisted records. Ingestion is
//! idempotent (events are deduplicated by their identity) and restart-safe (the
//! indexer resumes from the last processed ledger/cursor).

use std::collections::HashSet;
use std::fmt;

/// Schema version attached to every normalized record.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// The kinds of tag events this listener understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TagEventKind {
    Registration,
    Transfer,
    Resolution,
    Recovery,
}

impl TagEventKind {
    /// Maps a raw Soroban topic (first topic symbol) to a known event kind.
    pub fn from_topic(topic: &str) -> Option<Self> {
        match topic {
            "register" | "registration" => Some(TagEventKind::Registration),
            "transfer" => Some(TagEventKind::Transfer),
            "resolve" | "resolution" => Some(TagEventKind::Resolution),
            "recover" | "recovery" => Some(TagEventKind::Recovery),
            _ => None,
        }
    }
}

/// A raw event as delivered by the Soroban RPC / ledger stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawEvent {
    pub ledger: u32,
    pub tx_hash: String,
    pub contract_id: String,
    pub topics: Vec<String>,
    pub data: String,
}

/// A normalized, persistable tag event record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagEventRecord {
    pub ledger: u32,
    pub tx_hash: String,
    pub contract_id: String,
    pub topics: Vec<String>,
    pub schema_version: u32,
    pub kind: TagEventKind,
    pub payload: String,
}

impl TagEventRecord {
    /// Stable identity used for idempotent deduplication.
    pub fn identity(&self) -> String {
        format!("{}:{}:{}", self.ledger, self.tx_hash, self.contract_id)
    }
}

/// Errors surfaced while ingesting events.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndexerError {
    /// The event is missing required fields or has an unknown topic.
    MalformedEvent(String),
    /// A ledger gap was detected between the cursor and the incoming event.
    LedgerGap { expected: u32, found: u32 },
}

impl fmt::Display for IndexerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IndexerError::MalformedEvent(msg) => write!(f, "malformed event: {msg}"),
            IndexerError::LedgerGap { expected, found } => {
                write!(f, "ledger gap: expected {expected}, found {found}")
            }
        }
    }
}

impl std::error::Error for IndexerError {}

/// Persistence boundary for normalized records and the ingestion cursor.
pub trait EventStore {
    fn put(&mut self, record: &TagEventRecord) -> Result<(), String>;
    fn get(&self, identity: &str) -> Option<TagEventRecord>;
    fn last_processed_ledger(&self) -> Option<u32>;
    fn set_last_processed_ledger(&mut self, ledger: u32) -> Result<(), String>;
}

/// In-memory store, useful for tests and as a reference implementation.
#[derive(Debug, Default)]
pub struct MemoryEventStore {
    records: Vec<TagEventRecord>,
    cursor: Option<u32>,
}

impl EventStore for MemoryEventStore {
    fn put(&mut self, record: &TagEventRecord) -> Result<(), String> {
        self.records.push(record.clone());
        Ok(())
    }

    fn get(&self, identity: &str) -> Option<TagEventRecord> {
        self.records.iter().find(|r| r.identity() == identity).cloned()
    }

    fn last_processed_ledger(&self) -> Option<u32> {
        self.cursor
    }

    fn set_last_processed_ledger(&mut self, ledger: u32) -> Result<(), String> {
        self.cursor = Some(ledger);
        Ok(())
    }
}

/// The tag event listener: normalizes, deduplicates, and persists events.
pub struct TagEventListener<S: EventStore> {
    store: S,
    seen: HashSet<String>,
    cursor: Option<u32>,
}

impl<S: EventStore> TagEventListener<S> {
    /// Builds a listener, restoring the cursor from the store for restart safety.
    pub fn new(store: S) -> Self {
        let cursor = store.last_processed_ledger();
        Self {
            store,
            seen: HashSet::new(),
            cursor,
        }
    }

    /// The last ledger successfully processed, if any.
    pub fn cursor(&self) -> Option<u32> {
        self.cursor
    }

    /// Normalizes a raw event into a persistable record.
    pub fn normalize(raw: &RawEvent) -> Result<TagEventRecord, IndexerError> {
        if raw.tx_hash.trim().is_empty() {
            return Err(IndexerError::MalformedEvent("missing tx_hash".into()));
        }
        if raw.contract_id.trim().is_empty() {
            return Err(IndexerError::MalformedEvent("missing contract_id".into()));
        }
        let topic = raw
            .topics
            .first()
            .ok_or_else(|| IndexerError::MalformedEvent("missing topics".into()))?;
        let kind = TagEventKind::from_topic(topic)
            .ok_or_else(|| IndexerError::MalformedEvent(format!("unknown topic: {topic}")))?;

        Ok(TagEventRecord {
            ledger: raw.ledger,
            tx_hash: raw.tx_hash.clone(),
            contract_id: raw.contract_id.clone(),
            topics: raw.topics.clone(),
            schema_version: EVENT_SCHEMA_VERSION,
            kind,
            payload: raw.data.clone(),
        })
    }

    /// Ingests a single raw event.
    ///
    /// Idempotent: a duplicate event identity is skipped without error.
    /// Restart-safe: the cursor advances only after a successful persist.
    pub fn ingest(&mut self, raw: &RawEvent) -> Result<Option<TagEventRecord>, IndexerError> {
        let record = Self::normalize(raw)?;
        let identity = record.identity();

        if self.seen.contains(&identity) || self.store.get(&identity).is_some() {
            return Ok(None);
        }

        if let Some(cursor) = self.cursor {
            if record.ledger > cursor + 1 {
                return Err(IndexerError::LedgerGap {
                    expected: cursor + 1,
                    found: record.ledger,
                });
            }
        }

        self.store
            .put(&record)
            .map_err(IndexerError::MalformedEvent)?;
        self.seen.insert(identity);

        if self.cursor.map_or(true, |c| record.ledger > c) {
            self.cursor = Some(record.ledger);
            self.store
                .set_last_processed_ledger(record.ledger)
                .map_err(IndexerError::MalformedEvent)?;
        }

        Ok(Some(record))
    }

    /// Ingests a batch of raw events in order.
    pub fn ingest_batch(
        &mut self,
        raws: &[RawEvent],
    ) -> Result<Vec<TagEventRecord>, IndexerError> {
        let mut persisted = Vec::new();
        for raw in raws {
            if let Some(record) = self.ingest(raw)? {
                persisted.push(record);
            }
        }
        Ok(persisted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(ledger: u32, tx: &str, topic: &str) -> RawEvent {
        RawEvent {
            ledger,
            tx_hash: tx.into(),
            contract_id: "CABC".into(),
            topics: vec![topic.into(), "tag".into()],
            data: "payload".into(),
        }
    }

    #[test]
    fn normalizes_all_event_kinds() {
        for (topic, kind) in [
            ("register", TagEventKind::Registration),
            ("transfer", TagEventKind::Transfer),
            ("resolve", TagEventKind::Resolution),
            ("recover", TagEventKind::Recovery),
        ] {
            let record = TagEventListener::<MemoryEventStore>::normalize(&raw(1, "tx", topic))
                .expect("valid event");
            assert_eq!(record.kind, kind);
            assert_eq!(record.schema_version, EVENT_SCHEMA_VERSION);
            assert_eq!(record.ledger, 1);
            assert_eq!(record.tx_hash, "tx");
            assert_eq!(record.contract_id, "CABC");
            assert_eq!(record.topics, vec!["register".to_string(), "tag".to_string()].iter().map(|_| "").collect::<Vec<_>>().is_empty().then(|| vec!["register".to_string(), "tag".to_string()]).unwrap());
        }
    }

    #[test]
    fn duplicate_events_are_ignored() {
        let mut listener = TagEventListener::new(MemoryEventStore::default());
        let event = raw(1, "tx1", "register");

        assert!(listener.ingest(&event).unwrap().is_some());
        assert!(listener.ingest(&event).unwrap().is_none());
        assert_eq!(listener.cursor(), Some(1));
    }

    #[test]
    fn ledger_gap_is_reported() {
        let mut listener = TagEventListener::new(MemoryEventStore::default());
        listener.ingest(&raw(1, "tx1", "register")).unwrap();

        let err = listener.ingest(&raw(3, "tx3", "transfer")).unwrap_err();
        assert_eq!(err, IndexerError::LedgerGap { expected: 2, found: 3 });
    }

    #[test]
    fn malformed_events_are_rejected() {
        let mut listener = TagEventListener::new(MemoryEventStore::default());

        let mut missing_topic = raw(1, "tx1", "register");
        missing_topic.topics.clear();
        assert!(matches!(
            listener.ingest(&missing_topic),
            Err(IndexerError::MalformedEvent(_))
        ));

        let unknown = raw(1, "tx2", "bogus");
        assert!(matches!(
            listener.ingest(&unknown),
            Err(IndexerError::MalformedEvent(_))
        ));

        let mut no_tx = raw(1, "", "register");
        no_tx.tx_hash = "".into();
        assert!(matches!(
            listener.ingest(&no_tx),
            Err(IndexerError::MalformedEvent(_))
        ));
    }

    #[test]
    fn resumes_from_persisted_cursor() {
        let mut store = MemoryEventStore::default();
        store.set_last_processed_ledger(5).unwrap();

        let listener = TagEventListener::new(store);
        assert_eq!(listener.cursor(), Some(5));
    }
}
