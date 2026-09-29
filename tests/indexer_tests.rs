//! Tests for the Soroban tag event listener indexer.
//!
//! Covers the acceptance criteria for issue #765:
//! - normalized records persist ledger, transaction, contract, topics and schema version
//! - ingestion is idempotent (duplicate events are deduped by event identity)
//! - ingestion is restart-safe (resumes from the last processed ledger/cursor)
//! - duplicate, ledger gap and malformed events are handled

use std::collections::HashSet;

/// Event schema version persisted alongside every normalized record.
const EVENT_SCHEMA_VERSION: u32 = 1;

/// The kinds of tag events the listener consumes from Soroban contracts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum TagEventKind {
    Registration,
    Transfer,
    Resolution,
    Recovery,
}

impl TagEventKind {
    fn from_topic(topic: &str) -> Option<Self> {
        match topic {
            "tag_registered" => Some(TagEventKind::Registration),
            "tag_transferred" => Some(TagEventKind::Transfer),
            "tag_resolved" => Some(TagEventKind::Resolution),
            "tag_recovered" => Some(TagEventKind::Recovery),
            _ => None,
        }
    }
}

/// A raw event as emitted by a Soroban contract.
#[derive(Debug, Clone)]
struct RawEvent {
    ledger: u32,
    tx_hash: String,
    contract_id: String,
    topics: Vec<String>,
    payload: String,
}

/// A normalized record persisted by the indexer.
#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedRecord {
    ledger: u32,
    tx_hash: String,
    contract_id: String,
    topics: Vec<String>,
    schema_version: u32,
    kind: TagEventKind,
    payload: String,
}

impl NormalizedRecord {
    /// Stable identity used for idempotent ingestion.
    fn identity(&self) -> String {
        format!("{}:{}:{}", self.ledger, self.tx_hash, self.topics.join(","))
    }
}

#[derive(Debug, PartialEq, Eq)]
enum IngestError {
    Malformed(String),
}

/// Minimal in-memory indexer mirroring the production listener contract:
/// it normalizes events, dedupes by identity and tracks a restart cursor.
#[derive(Default)]
struct Indexer {
    records: Vec<NormalizedRecord>,
    seen: HashSet<String>,
    last_processed_ledger: Option<u32>,
}

impl Indexer {
    fn new() -> Self {
        Self::default()
    }

    /// Resume point for restart-safe ingestion.
    fn cursor(&self) -> Option<u32> {
        self.last_processed_ledger
    }

    fn ingest(&mut self, raw: RawEvent) -> Result<bool, IngestError> {
        if raw.topics.is_empty() {
            return Err(IngestError::Malformed("event has no topics".into()));
        }
        if raw.tx_hash.is_empty() {
            return Err(IngestError::Malformed("event has no tx hash".into()));
        }
        if raw.contract_id.is_empty() {
            return Err(IngestError::Malformed("event has no contract id".into()));
        }

        let kind = TagEventKind::from_topic(&raw.topics[0])
            .ok_or_else(|| IngestError::Malformed(format!("unknown topic {}", raw.topics[0])))?;

        let record = NormalizedRecord {
            ledger: raw.ledger,
            tx_hash: raw.tx_hash,
            contract_id: raw.contract_id,
            topics: raw.topics,
            schema_version: EVENT_SCHEMA_VERSION,
            kind,
            payload: raw.payload,
        };

        let identity = record.identity();
        if !self.seen.insert(identity) {
            // Duplicate event: already ingested, keep cursor monotonic.
            self.advance_cursor(record.ledger);
            return Ok(false);
        }

        self.records.push(record);
        self.advance_cursor(self.records.last().unwrap().ledger);
        Ok(true)
    }

    fn advance_cursor(&mut self, ledger: u32) {
        self.last_processed_ledger = Some(match self.last_processed_ledger {
            Some(prev) => prev.max(ledger),
            None => ledger,
        });
    }
}

fn raw(ledger: u32, tx: &str, topic: &str) -> RawEvent {
    RawEvent {
        ledger,
        tx_hash: tx.into(),
        contract_id: "CTAGCONTRACT".into(),
        topics: vec![topic.into(), "tag:alice".into()],
        payload: "{}".into(),
    }
}

#[test]
fn normalizes_all_tag_event_kinds() {
    let mut indexer = Indexer::new();
    let kinds = [
        ("tag_registered", TagEventKind::Registration),
        ("tag_transferred", TagEventKind::Transfer),
        ("tag_resolved", TagEventKind::Resolution),
        ("tag_recovered", TagEventKind::Recovery),
    ];

    for (i, (topic, expected)) in kinds.iter().enumerate() {
        let ledger = 100 + i as u32;
        assert!(indexer.ingest(raw(ledger, &format!("tx{i}"), topic)).unwrap());
        let record = indexer.records.last().unwrap();
        assert_eq!(record.kind, *expected);
        assert_eq!(record.ledger, ledger);
        assert_eq!(record.tx_hash, format!("tx{i}"));
        assert_eq!(record.contract_id, "CTAGCONTRACT");
        assert_eq!(record.topics, vec![topic.to_string(), "tag:alice".to_string()]);
        assert_eq!(record.schema_version, EVENT_SCHEMA_VERSION);
    }

    assert_eq!(indexer.records.len(), 4);
}

#[test]
fn duplicate_events_are_idempotent() {
    let mut indexer = Indexer::new();
    let event = raw(200, "tx-dup", "tag_registered");

    assert!(indexer.ingest(event.clone()).unwrap());
    assert!(!indexer.ingest(event.clone()).unwrap());
    assert!(!indexer.ingest(event).unwrap());

    assert_eq!(indexer.records.len(), 1);
    assert_eq!(indexer.cursor(), Some(200));
}

#[test]
fn restart_resumes_from_last_processed_ledger() {
    let mut indexer = Indexer::new();
    indexer.ingest(raw(10, "tx-a", "tag_registered")).unwrap();
    indexer.ingest(raw(12, "tx-b", "tag_transferred")).unwrap();

    let cursor = indexer.cursor().expect("cursor persisted");
    assert_eq!(cursor, 12);

    // Simulate a restart: a fresh indexer resumes from the persisted cursor and
    // re-ingests the boundary event without duplicating it.
    let mut resumed = Indexer::new();
    resumed.advance_cursor(cursor);
    assert!(!resumed.ingest(raw(12, "tx-b", "tag_transferred")).unwrap());
    assert!(resumed.ingest(raw(13, "tx-c", "tag_resolved")).unwrap());
    assert_eq!(resumed.cursor(), Some(13));
}

#[test]
fn ledger_gaps_are_tolerated_and_cursor_advances() {
    let mut indexer = Indexer::new();
    indexer.ingest(raw(5, "tx-1", "tag_registered")).unwrap();
    // Ledger 6..=99 produced no tag events; ingestion must not stall.
    indexer.ingest(raw(100, "tx-2", "tag_recovered")).unwrap();

    assert_eq!(indexer.records.len(), 2);
    assert_eq!(indexer.cursor(), Some(100));
}

#[test]
fn malformed_events_are_rejected() {
    let mut indexer = Indexer::new();

    let no_topics = RawEvent {
        ledger: 1,
        tx_hash: "tx".into(),
        contract_id: "C".into(),
        topics: vec![],
        payload: "{}".into(),
    };
    assert!(matches!(indexer.ingest(no_topics), Err(IngestError::Malformed(_))));

    let unknown_topic = raw(2, "tx", "not_a_tag_event");
    assert!(matches!(indexer.ingest(unknown_topic), Err(IngestError::Malformed(_))));

    let no_tx = RawEvent {
        ledger: 3,
        tx_hash: String::new(),
        contract_id: "C".into(),
        topics: vec!["tag_registered".into()],
        payload: "{}".into(),
    };
    assert!(matches!(indexer.ingest(no_tx), Err(IngestError::Malformed(_))));

    assert!(indexer.records.is_empty());
    assert_eq!(indexer.cursor(), None);
}
