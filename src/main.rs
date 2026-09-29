use std::collections::HashSet;
use std::fs;
use std::path::Path;

/// Schema version persisted with every normalized event record.
const EVENT_SCHEMA_VERSION: u32 = 1;

/// Cursor file used to make ingestion restart-safe.
const CURSOR_FILE: &str = "indexer_cursor.txt";

/// A normalized tag event extracted from a Soroban contract event.
#[derive(Debug, Clone, PartialEq, Eq)]
struct TagEvent {
    ledger: u32,
    tx_hash: String,
    contract_id: String,
    topics: Vec<String>,
    kind: TagEventKind,
    schema_version: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TagEventKind {
    Registration,
    Transfer,
    Resolution,
    Recovery,
}

impl TagEvent {
    /// Stable identity used for idempotent ingestion.
    fn identity(&self) -> String {
        format!("{}:{}:{}", self.ledger, self.tx_hash, self.topics.join(","))
    }
}

/// Raw event as delivered by the Soroban RPC / ledger stream.
#[derive(Debug, Clone)]
struct RawEvent {
    ledger: u32,
    tx_hash: String,
    contract_id: String,
    topics: Vec<String>,
    data: String,
}

#[derive(Debug)]
enum IngestError {
    Malformed(String),
}

/// Normalize a raw Soroban event into a persisted tag event record.
fn normalize(raw: &RawEvent) -> Result<TagEvent, IngestError> {
    if raw.tx_hash.trim().is_empty() {
        return Err(IngestError::Malformed("missing transaction hash".into()));
    }
    if raw.contract_id.trim().is_empty() {
        return Err(IngestError::Malformed("missing contract id".into()));
    }
    if raw.topics.is_empty() {
        return Err(IngestError::Malformed("missing topics".into()));
    }

    let kind = match raw.topics[0].as_str() {
        "tag_register" | "register" => TagEventKind::Registration,
        "tag_transfer" | "transfer" => TagEventKind::Transfer,
        "tag_resolve" | "resolve" => TagEventKind::Resolution,
        "tag_recover" | "recover" => TagEventKind::Recovery,
        other => return Err(IngestError::Malformed(format!("unknown topic {other}"))),
    };

    Ok(TagEvent {
        ledger: raw.ledger,
        tx_hash: raw.tx_hash.clone(),
        contract_id: raw.contract_id.clone(),
        topics: raw.topics.clone(),
        kind,
        schema_version: EVENT_SCHEMA_VERSION,
    })
}

/// Idempotent, restart-safe ingestion state.
struct Indexer {
    seen: HashSet<String>,
    last_ledger: u32,
    records: Vec<TagEvent>,
}

impl Indexer {
    fn new() -> Self {
        Self {
            seen: HashSet::new(),
            last_ledger: 0,
            records: Vec::new(),
        }
    }

    /// Restore the cursor so ingestion resumes after a restart.
    fn load_cursor(&mut self) {
        if let Ok(contents) = fs::read_to_string(CURSOR_FILE) {
            if let Ok(ledger) = contents.trim().parse::<u32>() {
                self.last_ledger = ledger;
            }
        }
    }

    fn persist_cursor(&self) {
        let _ = fs::write(CURSOR_FILE, self.last_ledger.to_string());
    }

    /// Ingest a batch of raw events, skipping duplicates and already-processed ledgers.
    fn ingest(&mut self, batch: &[RawEvent]) -> Vec<Result<TagEvent, IngestError>> {
        let mut results = Vec::with_capacity(batch.len());
        for raw in batch {
            if raw.ledger <= self.last_ledger {
                // Already processed before restart; skip to stay idempotent.
                continue;
            }
            match normalize(raw) {
                Ok(event) => {
                    let id = event.identity();
                    if self.seen.insert(id) {
                        self.last_ledger = self.last_ledger.max(event.ledger);
                        self.records.push(event.clone());
                        results.push(Ok(event));
                    }
                }
                Err(err) => results.push(Err(err)),
            }
        }
        self.persist_cursor();
        results
    }
}

fn main() {
    let mut indexer = Indexer::new();
    indexer.load_cursor();

    // Placeholder stream; a real deployment wires this to Soroban RPC.
    let batch: Vec<RawEvent> = Vec::new();
    let _ = indexer.ingest(&batch);

    if Path::new(CURSOR_FILE).exists() {
        println!("indexer ready, last ledger {}", indexer.last_ledger);
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
            topics: vec![topic.into()],
            data: "{}".into(),
        }
    }

    #[test]
    fn normalizes_all_event_kinds() {
        assert_eq!(normalize(&raw(1, "a", "tag_register")).unwrap().kind, TagEventKind::Registration);
        assert_eq!(normalize(&raw(1, "a", "tag_transfer")).unwrap().kind, TagEventKind::Transfer);
        assert_eq!(normalize(&raw(1, "a", "tag_resolve")).unwrap().kind, TagEventKind::Resolution);
        assert_eq!(normalize(&raw(1, "a", "tag_recover")).unwrap().kind, TagEventKind::Recovery);
    }

    #[test]
    fn persists_required_fields() {
        let event = normalize(&raw(7, "tx1", "tag_register")).unwrap();
        assert_eq!(event.ledger, 7);
        assert_eq!(event.tx_hash, "tx1");
        assert_eq!(event.contract_id, "CABC");
        assert_eq!(event.topics, vec!["tag_register".to_string()]);
        assert_eq!(event.schema_version, EVENT_SCHEMA_VERSION);
    }

    #[test]
    fn duplicate_events_are_ignored() {
        let mut indexer = Indexer::new();
        let batch = vec![raw(1, "tx1", "tag_register"), raw(1, "tx1", "tag_register")];
        let results = indexer.ingest(&batch);
        assert_eq!(results.len(), 1);
        assert_eq!(indexer.records.len(), 1);
    }

    #[test]
    fn ledger_gaps_are_tolerated() {
        let mut indexer = Indexer::new();
        let batch = vec![raw(1, "tx1", "tag_register"), raw(5, "tx2", "tag_transfer")];
        let results = indexer.ingest(&batch);
        assert_eq!(results.len(), 2);
        assert_eq!(indexer.last_ledger, 5);
    }

    #[test]
    fn malformed_events_are_reported() {
        let mut indexer = Indexer::new();
        let mut bad = raw(1, "tx1", "tag_register");
        bad.topics.clear();
        let results = indexer.ingest(&[bad]);
        assert!(matches!(results[0], Err(IngestError::Malformed(_))));
    }

    #[test]
    fn restart_skips_processed_ledgers() {
        let mut indexer = Indexer::new();
        indexer.last_ledger = 3;
        let results = indexer.ingest(&[raw(2, "tx1", "tag_register")]);
        assert!(results.is_empty());
    }
}
