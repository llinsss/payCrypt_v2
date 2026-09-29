use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

/// Schema version persisted alongside every normalized event record.
pub const SCHEMA_VERSION: u32 = 1;

/// Normalized event kinds the indexer understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EventKind {
    Tag,
    Escrow,
    Wallet,
    Payment,
}

impl EventKind {
    /// Map a raw Soroban topic to a normalized event kind.
    pub fn from_topic(topic: &str) -> Option<Self> {
        match topic {
            "tag" => Some(EventKind::Tag),
            "escrow" => Some(EventKind::Escrow),
            "wallet" => Some(EventKind::Wallet),
            "payment" => Some(EventKind::Payment),
            _ => None,
        }
    }
}

/// A normalized, durable record for a single Soroban event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedEvent {
    pub contract_id: String,
    pub ledger_sequence: u64,
    pub transaction_hash: String,
    pub event_index: u32,
    pub topics: Vec<String>,
    pub kind: EventKind,
    pub schema_version: u32,
}

impl NormalizedEvent {
    /// Deterministic dedupe key: contract + ledger + tx + event index.
    pub fn dedupe_key(&self) -> String {
        format!(
            "{}:{}:{}:{}",
            self.contract_id, self.ledger_sequence, self.transaction_hash, self.event_index
        )
    }
}

/// Outcome of attempting to ingest a single event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IngestOutcome {
    Inserted,
    Duplicate,
    Retried,
    DeadLettered,
}

/// Retry and dead-letter metrics exposed by the indexer.
#[derive(Debug, Default)]
pub struct IndexerMetrics {
    ingested: AtomicU64,
    duplicates: AtomicU64,
    retries: AtomicU64,
    dead_letters: AtomicU64,
    retries_by_kind: Mutex<HashMap<EventKind, u64>>,
    dead_letters_by_kind: Mutex<HashMap<EventKind, u64>>,
}

impl IndexerMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, outcome: IngestOutcome, kind: EventKind) {
        match outcome {
            IngestOutcome::Inserted => {
                self.ingested.fetch_add(1, Ordering::Relaxed);
            }
            IngestOutcome::Duplicate => {
                self.duplicates.fetch_add(1, Ordering::Relaxed);
            }
            IngestOutcome::Retried => {
                self.retries.fetch_add(1, Ordering::Relaxed);
                *self
                    .retries_by_kind
                    .lock()
                    .expect("retry metrics lock poisoned")
                    .entry(kind)
                    .or_insert(0) += 1;
            }
            IngestOutcome::DeadLettered => {
                self.dead_letters.fetch_add(1, Ordering::Relaxed);
                *self
                    .dead_letters_by_kind
                    .lock()
                    .expect("dead-letter metrics lock poisoned")
                    .entry(kind)
                    .or_insert(0) += 1;
            }
        }
    }

    pub fn ingested(&self) -> u64 {
        self.ingested.load(Ordering::Relaxed)
    }

    pub fn duplicates(&self) -> u64 {
        self.duplicates.load(Ordering::Relaxed)
    }

    pub fn retries(&self) -> u64 {
        self.retries.load(Ordering::Relaxed)
    }

    pub fn dead_letters(&self) -> u64 {
        self.dead_letters.load(Ordering::Relaxed)
    }

    pub fn retries_for(&self, kind: EventKind) -> u64 {
        self.retries_by_kind
            .lock()
            .expect("retry metrics lock poisoned")
            .get(&kind)
            .copied()
            .unwrap_or(0)
    }

    pub fn dead_letters_for(&self, kind: EventKind) -> u64 {
        self.dead_letters_by_kind
            .lock()
            .expect("dead-letter metrics lock poisoned")
            .get(&kind)
            .copied()
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(kind: EventKind, index: u32) -> NormalizedEvent {
        NormalizedEvent {
            contract_id: "CABC".to_string(),
            ledger_sequence: 42,
            transaction_hash: "deadbeef".to_string(),
            event_index: index,
            topics: vec!["payment".to_string()],
            kind,
            schema_version: SCHEMA_VERSION,
        }
    }

    #[test]
    fn dedupe_key_is_deterministic() {
        let a = sample(EventKind::Payment, 0);
        let b = sample(EventKind::Payment, 0);
        assert_eq!(a.dedupe_key(), b.dedupe_key());
        assert_ne!(a.dedupe_key(), sample(EventKind::Payment, 1).dedupe_key());
    }

    #[test]
    fn metrics_track_retries_and_dead_letters() {
        let metrics = IndexerMetrics::new();
        metrics.record(IngestOutcome::Inserted, EventKind::Payment);
        metrics.record(IngestOutcome::Duplicate, EventKind::Payment);
        metrics.record(IngestOutcome::Retried, EventKind::Escrow);
        metrics.record(IngestOutcome::DeadLettered, EventKind::Escrow);

        assert_eq!(metrics.ingested(), 1);
        assert_eq!(metrics.duplicates(), 1);
        assert_eq!(metrics.retries(), 1);
        assert_eq!(metrics.dead_letters(), 1);
        assert_eq!(metrics.retries_for(EventKind::Escrow), 1);
        assert_eq!(metrics.dead_letters_for(EventKind::Escrow), 1);
    }
}
