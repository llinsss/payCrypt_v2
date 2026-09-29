use std::collections::HashMap;

/// Schema version persisted alongside every normalized event record.
/// Bump this whenever the normalized record layout changes.
pub const SCHEMA_VERSION: u32 = 1;

/// The Soroban event categories this indexer normalizes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EventKind {
    Tag,
    Escrow,
    Wallet,
    Payment,
}

impl EventKind {
    /// Map a raw contract event topic to a normalized kind.
    pub fn from_topic(topic: &str) -> Option<Self> {
        match topic {
            "tag" => Some(EventKind::Tag),
            "escrow" => Some(EventKind::Escrow),
            "wallet" => Some(EventKind::Wallet),
            "payment" => Some(EventKind::Payment),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            EventKind::Tag => "tag",
            EventKind::Escrow => "escrow",
            EventKind::Wallet => "wallet",
            EventKind::Payment => "payment",
        }
    }
}

/// A normalized, durable record for a single Soroban event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventRecord {
    pub contract_id: String,
    pub ledger_sequence: u32,
    pub transaction_hash: String,
    pub event_index: u32,
    pub topics: Vec<String>,
    pub kind: EventKind,
    pub schema_version: u32,
}

impl EventRecord {
    /// Deterministic idempotency key: contract + ledger + tx + event index.
    /// Re-ingesting the same event yields the same key and is deduped.
    pub fn event_key(&self) -> String {
        format!(
            "{}:{}:{}:{}",
            self.contract_id, self.ledger_sequence, self.transaction_hash, self.event_index
        )
    }
}

/// Metrics surfaced for ingestion health.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IndexerMetrics {
    pub ingested: u64,
    pub duplicates: u64,
    pub retries: u64,
    pub dead_letters: u64,
}

/// Durable store for normalized event records.
///
/// Ingestion is idempotent: records are keyed by [`EventRecord::event_key`],
/// so replaying the same ledger range never produces duplicate rows.
#[derive(Debug, Default)]
pub struct EventStore {
    records: HashMap<String, EventRecord>,
    metrics: IndexerMetrics,
}

impl EventStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Persist a normalized record. Returns `true` when newly stored,
    /// `false` when the event was already present (idempotent no-op).
    pub fn ingest(&mut self, record: EventRecord) -> bool {
        let key = record.event_key();
        if self.records.contains_key(&key) {
            self.metrics.duplicates += 1;
            return false;
        }
        self.records.insert(key, record);
        self.metrics.ingested += 1;
        true
    }

    /// Record a failed ingestion attempt that will be retried.
    pub fn record_retry(&mut self) {
        self.metrics.retries += 1;
    }

    /// Record an ingestion attempt that exhausted retries and was dead-lettered.
    pub fn record_dead_letter(&mut self) {
        self.metrics.dead_letters += 1;
    }

    pub fn metrics(&self) -> &IndexerMetrics {
        &self.metrics
    }

    pub fn get(&self, key: &str) -> Option<&EventRecord> {
        self.records.get(key)
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }
}
