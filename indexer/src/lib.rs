//! Soroban event indexer library.
//!
//! Provides durable cursor + ledger-hash persistence, gap detection and
//! idempotent replay, and reorg/rollback handling so phantom payments are
//! never permanently recorded.

use std::collections::HashSet;

/// A single indexed event with the ledger context needed for idempotency
/// and reorg detection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedEvent {
    /// Unique event identifier (e.g. contract id + tx hash + event index).
    pub id: String,
    /// Ledger sequence the event was emitted in.
    pub ledger: u64,
    /// Hash of the ledger the event was emitted in.
    pub ledger_hash: String,
    /// Opaque event payload.
    pub payload: Vec<u8>,
}

/// Durable indexer progress: the last processed ledger and its hash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cursor {
    pub ledger: u64,
    pub ledger_hash: String,
}

/// Outcome of reconciling an observed ledger against the persisted cursor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reconcile {
    /// Next ledger is contiguous with the cursor; process normally.
    Contiguous,
    /// Ledgers were missed; replay the inclusive range before continuing.
    Gap { from: u64, to: u64 },
    /// The persisted cursor's ledger hash no longer matches the chain;
    /// roll back to `rewind_to` and replay from there.
    Reorg { rewind_to: u64 },
}

/// Persistent store abstraction for cursor and events.
pub trait IndexerStore {
    fn load_cursor(&self) -> Option<Cursor>;
    fn save_cursor(&mut self, cursor: &Cursor);
    fn has_event(&self, id: &str) -> bool;
    fn put_event(&mut self, event: &IndexedEvent);
    /// Remove events at or above `ledger` (used when rewinding on a reorg).
    fn rollback_from(&mut self, ledger: u64);
}

/// Durable, idempotent indexer with gap and reorg handling.
pub struct Indexer<S: IndexerStore> {
    store: S,
    seen: HashSet<String>,
}

impl<S: IndexerStore> Indexer<S> {
    pub fn new(store: S) -> Self {
        Self {
            store,
            seen: HashSet::new(),
        }
    }

    /// Persist the cursor together with the ledger hash so progress and
    /// chain identity are durable across restarts.
    pub fn persist_cursor(&mut self, ledger: u64, ledger_hash: &str) {
        self.store.save_cursor(&Cursor {
            ledger,
            ledger_hash: ledger_hash.to_string(),
        });
    }

    /// Compare the next observed ledger against the persisted cursor and
    /// decide whether to process, replay a gap, or rewind for a reorg.
    pub fn reconcile(&self, next_ledger: u64, next_hash: &str) -> Reconcile {
        match self.store.load_cursor() {
            None => Reconcile::Contiguous,
            Some(cursor) => {
                if next_ledger == cursor.ledger {
                    // Same ledger observed again: verify chain identity.
                    if next_hash != cursor.ledger_hash {
                        Reconcile::Reorg {
                            rewind_to: cursor.ledger,
                        }
                    } else {
                        Reconcile::Contiguous
                    }
                } else if next_ledger > cursor.ledger + 1 {
                    Reconcile::Gap {
                        from: cursor.ledger + 1,
                        to: next_ledger - 1,
                    }
                } else {
                    Reconcile::Contiguous
                }
            }
        }
    }

    /// Reconcile and apply the observed ledger, replaying gaps and rewinding
    /// on reorgs. Returns the events actually recorded (duplicates skipped).
    pub fn ingest(
        &mut self,
        next_ledger: u64,
        next_hash: &str,
        events: Vec<IndexedEvent>,
    ) -> Vec<IndexedEvent> {
        match self.reconcile(next_ledger, next_hash) {
            Reconcile::Reorg { rewind_to } => {
                self.store.rollback_from(rewind_to);
                self.seen.clear();
            }
            Reconcile::Gap { .. } | Reconcile::Contiguous => {}
        }

        let recorded = self.record(events);
        self.persist_cursor(next_ledger, next_hash);
        recorded
    }

    /// Record events idempotently: an event already persisted (or already
    /// seen in this run) is never written twice.
    fn record(&mut self, events: Vec<IndexedEvent>) -> Vec<IndexedEvent> {
        let mut recorded = Vec::new();
        for event in events {
            if self.seen.contains(&event.id) || self.store.has_event(&event.id) {
                continue;
            }
            self.store.put_event(&event);
            self.seen.insert(event.id.clone());
            recorded.push(event);
        }
        recorded
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[derive(Default)]
    struct MemStore {
        cursor: Option<Cursor>,
        events: HashMap<String, IndexedEvent>,
    }

    impl IndexerStore for MemStore {
        fn load_cursor(&self) -> Option<Cursor> {
            self.cursor.clone()
        }
        fn save_cursor(&mut self, cursor: &Cursor) {
            self.cursor = Some(cursor.clone());
        }
        fn has_event(&self, id: &str) -> bool {
            self.events.contains_key(id)
        }
        fn put_event(&mut self, event: &IndexedEvent) {
            self.events.insert(event.id.clone(), event.clone());
        }
        fn rollback_from(&mut self, ledger: u64) {
            self.events.retain(|_, e| e.ledger < ledger);
        }
    }

    fn event(id: &str, ledger: u64, hash: &str) -> IndexedEvent {
        IndexedEvent {
            id: id.to_string(),
            ledger,
            ledger_hash: hash.to_string(),
            payload: vec![],
        }
    }

    #[test]
    fn detects_and_replays_gap() {
        let mut indexer = Indexer::new(MemStore::default());
        indexer.ingest(10, "h10", vec![event("a", 10, "h10")]);

        // Ledger 11 and 12 were missed; next observed is 13.
        assert_eq!(
            indexer.reconcile(13, "h13"),
            Reconcile::Gap { from: 11, to: 12 }
        );

        // Replay the missing range, then the observed ledger.
        indexer.ingest(11, "h11", vec![event("b", 11, "h11")]);
        indexer.ingest(12, "h12", vec![event("c", 12, "h12")]);
        let recorded = indexer.ingest(13, "h13", vec![event("d", 13, "h13")]);

        assert_eq!(recorded.len(), 1);
        assert_eq!(indexer.store.load_cursor().unwrap().ledger, 13);
        assert_eq!(indexer.store.events.len(), 4);
    }

    #[test]
    fn duplicate_events_are_idempotent() {
        let mut indexer = Indexer::new(MemStore::default());
        let first = indexer.ingest(5, "h5", vec![event("dup", 5, "h5")]);
        assert_eq!(first.len(), 1);

        // Same event replayed: must not be recorded twice.
        let second = indexer.ingest(5, "h5", vec![event("dup", 5, "h5")]);
        assert!(second.is_empty());
        assert_eq!(indexer.store.events.len(), 1);
    }

    #[test]
    fn reorg_rewinds_and_drops_phantom_events() {
        let mut indexer = Indexer::new(MemStore::default());
        indexer.ingest(7, "h7", vec![event("p", 7, "h7")]);

        // Same ledger, different hash => reorg at the cursor.
        assert_eq!(
            indexer.reconcile(7, "h7-new"),
            Reconcile::Reorg { rewind_to: 7 }
        );

        let recorded = indexer.ingest(7, "h7-new", vec![event("q", 7, "h7-new")]);
        assert_eq!(recorded.len(), 1);
        assert!(!indexer.store.has_event("p"));
        assert!(indexer.store.has_event("q"));
        assert_eq!(indexer.store.load_cursor().unwrap().ledger_hash, "h7-new");
    }
}
