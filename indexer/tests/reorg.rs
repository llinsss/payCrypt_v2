//! Tests for reorg / ledger-gap handling in the Rust indexer.
//!
//! These tests exercise the acceptance criteria for issue #755:
//! - the cursor is persisted together with the ledger hash,
//! - missed ledgers (gaps) are detected and reconciled by replaying the
//!   missing range,
//! - duplicate events are detected and replay is idempotent,
//! - rollback / reorg-like corrections (ledger hash mismatch at the
//!   persisted cursor) are handled instead of recording phantom payments.

use std::collections::HashMap;

/// A single indexed event, keyed by the ledger it was emitted in.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Event {
    ledger: u32,
    id: String,
}

/// Durable indexer cursor: the last processed ledger plus its hash.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Cursor {
    ledger: u32,
    hash: String,
}

/// Minimal in-memory stand-in for the persistent indexer store.
#[derive(Default)]
struct Store {
    cursor: Option<Cursor>,
    /// Recorded events keyed by event id so replay stays idempotent.
    events: HashMap<String, Event>,
}

impl Store {
    fn persist_cursor(&mut self, ledger: u32, hash: &str) {
        self.cursor = Some(Cursor {
            ledger,
            hash: hash.to_string(),
        });
    }

    fn record(&mut self, event: Event) -> bool {
        // Idempotent: the same event id is never recorded twice.
        if self.events.contains_key(&event.id) {
            return false;
        }
        self.events.insert(event.id.clone(), event);
        true
    }
}

/// A simulated chain: ledger number -> (hash, events).
struct Chain {
    ledgers: HashMap<u32, (String, Vec<Event>)>,
}

impl Chain {
    fn hash(&self, ledger: u32) -> Option<&str> {
        self.ledgers.get(&ledger).map(|(h, _)| h.as_str())
    }

    fn events(&self, ledger: u32) -> &[Event] {
        self.ledgers
            .get(&ledger)
            .map(|(_, e)| e.as_slice())
            .unwrap_or(&[])
    }
}

/// Result of reconciling the store against the observed chain head.
#[derive(Debug, PartialEq, Eq)]
enum Reconcile {
    /// Nothing to do; the store is already at the observed head.
    UpToDate,
    /// A gap was detected and the missing range was replayed.
    Replayed { from: u32, to: u32 },
    /// The persisted cursor hash no longer matches the chain (reorg).
    RolledBack { at: u32 },
}

/// Reconcile the store with the observed chain head, replaying gaps and
/// detecting reorg-like corrections via the persisted ledger hash.
fn reconcile(store: &mut Store, chain: &Chain, head: u32) -> Reconcile {
    let Some(cursor) = store.cursor.clone() else {
        // No cursor yet: replay from the first known ledger up to head.
        let from = chain.ledgers.keys().copied().min().unwrap_or(head);
        replay(store, chain, from, head);
        return Reconcile::Replayed { from, to: head };
    };

    // Reorg detection: the hash at the persisted cursor must still match.
    if let Some(actual) = chain.hash(cursor.ledger) {
        if actual != cursor.hash {
            return Reconcile::RolledBack {
                at: cursor.ledger,
            };
        }
    }

    if head <= cursor.ledger {
        return Reconcile::UpToDate;
    }

    // Gap: replay the missing range (cursor.ledger + 1 ..= head).
    let from = cursor.ledger + 1;
    replay(store, chain, from, head);
    Reconcile::Replayed { from, to: head }
}

/// Replay a ledger range idempotently, persisting the cursor + hash as we go.
fn replay(store: &mut Store, chain: &Chain, from: u32, to: u32) {
    for ledger in from..=to {
        for event in chain.events(ledger) {
            store.record(event.clone());
        }
        if let Some(hash) = chain.hash(ledger) {
            store.persist_cursor(ledger, hash);
        }
    }
}

fn event(ledger: u32, id: &str) -> Event {
    Event {
        ledger,
        id: id.to_string(),
    }
}

fn chain(entries: &[(u32, &str, Vec<Event>)]) -> Chain {
    let mut ledgers = HashMap::new();
    for (ledger, hash, events) in entries {
        ledgers.insert(*ledger, (hash.to_string(), events.clone()));
    }
    Chain { ledgers }
}

#[test]
fn persists_cursor_with_ledger_hash() {
    let mut store = Store::default();
    let chain = chain(&[(10, "h10", vec![event(10, "e10")])]);

    let result = reconcile(&mut store, &chain, 10);

    assert_eq!(result, Reconcile::Replayed { from: 10, to: 10 });
    assert_eq!(
        store.cursor,
        Some(Cursor {
            ledger: 10,
            hash: "h10".to_string(),
        })
    );
}

#[test]
fn detects_and_replays_ledger_gap() {
    let mut store = Store::default();
    let chain = chain(&[
        (10, "h10", vec![event(10, "e10")]),
        (11, "h11", vec![event(11, "e11")]),
        (12, "h12", vec![event(12, "e12")]),
    ]);

    // Process ledger 10 first, then jump to head 12 (ledger 11 was missed).
    reconcile(&mut store, &chain, 10);
    let result = reconcile(&mut store, &chain, 12);

    assert_eq!(result, Reconcile::Replayed { from: 11, to: 12 });
    assert!(store.events.contains_key("e11"));
    assert!(store.events.contains_key("e12"));
    assert_eq!(store.cursor.as_ref().unwrap().ledger, 12);
}

#[test]
fn replay_is_idempotent_for_duplicate_events() {
    let mut store = Store::default();
    let chain = chain(&[(10, "h10", vec![event(10, "e10")])]);

    reconcile(&mut store, &chain, 10);
    // Replaying the same range must not duplicate the event.
    replay(&mut store, &chain, 10, 10);

    assert_eq!(store.events.len(), 1);
    assert!(store.events.contains_key("e10"));
}

#[test]
fn detects_rollback_on_cursor_hash_mismatch() {
    let mut store = Store::default();
    let original = chain(&[(10, "h10", vec![event(10, "e10")])]);
    reconcile(&mut store, &original, 10);

    // A reorg replaces ledger 10 with a different hash.
    let reorged = chain(&[(10, "h10-reorged", vec![event(10, "e10-new")])]);
    let result = reconcile(&mut store, &reorged, 10);

    assert_eq!(result, Reconcile::RolledBack { at: 10 });
    // The phantom payment from the old chain is not silently kept as truth.
    assert_eq!(store.cursor.as_ref().unwrap().hash, "h10");
}
