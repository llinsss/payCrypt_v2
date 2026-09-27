# Contract Upgrade-Aware Indexer Routing

This document specifies how the indexer routes contract events to the correct
versioned handler when a Soroban contract is upgraded. It covers persistence,
idempotency, crash recovery, indexing integration, operational metrics, and
rollback behavior.

## Goals

- Route each contract event to the handler that matches the contract version
  active at the event's ledger sequence.
- Make routing deterministic and replay-safe.
- Survive process restarts without losing or double-applying routing state.
- Expose metrics so operators can detect routing drift and upgrade gaps.

## Typed model

```rust
/// A single contract version window, keyed by the ledger range in which it was active.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContractVersion {
    pub contract_id: String,
    pub version: u32,
    /// First ledger at which this version became active (inclusive).
    pub active_from_ledger: u32,
    /// Last ledger at which this version was active (inclusive); None = current.
    pub active_until_ledger: Option<u32>,
    /// Stable identifier of the handler that processes events for this version.
    pub handler_id: String,
}

/// Persisted routing registry for a single contract.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ContractRoutingRegistry {
    pub contract_id: String,
    /// Ordered by `active_from_ledger`, non-overlapping.
    pub versions: Vec<ContractVersion>,
}

/// Result of resolving an event to a handler.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RouteResolution {
    /// Exactly one version window matched.
    Matched { version: u32, handler_id: String },
    /// No version window covers the ledger (e.g. event before first known upgrade).
    Unrouted { ledger: u32 },
    /// More than one window matched — registry is inconsistent.
    Ambiguous { ledger: u32, versions: Vec<u32> },
}
```

## Deterministic route resolution

Resolution is a pure function of the registry and the event ledger. It never
consults wall-clock time or mutable global state.

```rust
impl ContractRoutingRegistry {
    /// Resolve the handler for an event at `ledger`.
    ///
    /// Windows are half-open on the upper bound: a version is active for
    /// `active_from_ledger <= ledger <= active_until_ledger` (inclusive),
    /// and the current version has `active_until_ledger == None`.
    pub fn resolve(&self, ledger: u32) -> RouteResolution {
        let mut matches: Vec<&ContractVersion> = self
            .versions
            .iter()
            .filter(|v| {
                ledger >= v.active_from_ledger
                    && v.active_until_ledger.map_or(true, |end| ledger <= end)
            })
            .collect();

        match matches.len() {
            0 => RouteResolution::Unrouted { ledger },
            1 => {
                let v = matches.remove(0);
                RouteResolution::Matched {
                    version: v.version,
                    handler_id: v.handler_id.clone(),
                }
            }
            _ => RouteResolution::Ambiguous {
                ledger,
                versions: matches.iter().map(|v| v.version).collect(),
            },
        }
    }
}
```

Invariants enforced when a registry is loaded or updated:

1. `versions` is sorted by `active_from_ledger` ascending.
2. Windows do not overlap: for consecutive `a`, `b`,
   `a.active_until_ledger` is `Some(n)` and `b.active_from_ledger == n + 1`,
   or `a.active_until_ledger` is `None` and `a` is last.
3. At most one version has `active_until_ledger == None`.
4. `version` values are strictly increasing with `active_from_ledger`.

A registry that violates any invariant is rejected at load time; the indexer
refuses to start rather than route events incorrectly.

## Persistence

Routing state is persisted separately from event data so it can be rebuilt and
verified independently.

- **Registry store**: one record per `contract_id` holding the serialized
  `ContractRoutingRegistry`. Written atomically (write-temp + rename) so a
  crash mid-write leaves the previous registry intact.
- **Cursor store**: the last fully processed ledger per contract, written in the
  same transaction as the registry update when an upgrade is observed.
- **Upgrade log**: append-only records of observed upgrade events
  (`contract_id`, `version`, `ledger`, `handler_id`). Used to rebuild the
  registry deterministically if the registry store is lost.

Rebuild procedure: replay the upgrade log in ledger order, applying the same
invariant checks, to reconstruct `ContractRoutingRegistry`. Because the log is
ordered and the fold is pure, the rebuilt registry is byte-identical to the
original.

## Idempotency and replay safety

- Each event is keyed by `(contract_id, ledger, tx_hash, event_index)`.
- The indexer records processed event keys in a dedup set scoped to the
  contract. Re-processing an already-seen key is a no-op.
- Applying an upgrade is idempotent: if the upgrade log already contains
  `(contract_id, version, ledger)`, the registry update is skipped.
- Route resolution is pure, so replaying the same ledger range against the same
  registry yields identical handler assignments.

## Crash recovery

On startup the indexer:

1. Loads the registry store. If missing or invalid, rebuilds from the upgrade
   log and re-validates invariants.
2. Loads the cursor store. If the cursor is ahead of the last durable event
   write, it is rolled back to the last committed ledger.
3. Resumes indexing from `cursor + 1`. Events at or below the cursor are
   replayed through the dedup set, so re-delivery is safe.
4. Re-emits any pending upgrade-log entries that were written but not yet
   reflected in the registry (write-ahead ordering: log first, then registry).

Because the upgrade log is written before the registry, a crash between the two
writes is recovered by replaying the log — never by guessing.

## Indexing integration

For each decoded contract event:

1. Look up the registry for `event.contract_id`.
2. Call `registry.resolve(event.ledger)`.
3. Dispatch on the result:
   - `Matched` → invoke the handler identified by `handler_id`.
   - `Unrouted` → buffer the event and emit `indexer_routing_unrouted_total`;
     retry after the next registry refresh.
   - `Ambiguous` → halt indexing for that contract, emit
     `indexer_routing_ambiguous_total`, and require operator intervention.
4. On successful handling, advance the cursor and record the event key.

Handlers are registered by `handler_id`; a missing handler for a matched
version is a fatal configuration error surfaced at startup, not at event time.

## Operational metrics

| Metric | Type | Meaning |
| --- | --- | --- |
| `indexer_routing_resolved_total` | counter | Events routed successfully, labeled by `contract_id`, `version`. |
| `indexer_routing_unrouted_total` | counter | Events with no matching version window. |
| `indexer_routing_ambiguous_total` | counter | Events matching multiple windows (registry inconsistency). |
| `indexer_routing_registry_version` | gauge | Highest known version per `contract_id`. |
| `indexer_routing_cursor_ledger` | gauge | Last committed ledger per `contract_id`. |
| `indexer_routing_rebuild_total` | counter | Registry rebuilds from the upgrade log. |
| `indexer_routing_replay_skipped_total` | counter | Events skipped by the dedup set. |

Alerting guidance:

- Page if `indexer_routing_ambiguous_total` increases — routing is unsafe.
- Warn if `indexer_routing_unrouted_total` increases for more than one refresh
  cycle — a contract may have upgraded without a corresponding registry entry.
- Warn if `indexer_routing_cursor_ledger` stalls while new ledgers are produced.

## Migration

1. Deploy the registry store and upgrade log alongside the existing indexer.
2. Backfill the upgrade log from historical contract-upgrade events.
3. Rebuild registries from the log and validate invariants.
4. Enable routing dispatch behind a feature flag; compare resolved handlers
   against the legacy single-handler path in shadow mode.
5. Once shadow output matches, flip the flag and remove the legacy path.

## Rollback

- Routing is gated by a feature flag; disabling it restores the legacy
  single-handler path without touching persisted state.
- The registry store and upgrade log are additive; rolling back the indexer
  binary leaves them intact for a later re-enable.
- If a bad registry is deployed, restore the previous registry record from the
  atomic backup and replay the upgrade log forward to the current ledger.
- Cursors are monotonic; a rollback never rewinds the cursor below a committed
  ledger, so no events are silently dropped.

## Testing

- **Unit**: `resolve` for exact boundaries (`active_from_ledger`,
  `active_until_ledger`), gaps, and overlaps.
- **Property**: for any valid registry and any ledger, `resolve` returns exactly
  one of the three variants, and `Matched` versions are non-decreasing in ledger.
- **Local network**: deploy a contract, upgrade it, and assert events before and
  after the upgrade route to the correct versioned handlers.
- **Replay**: re-run a ledger range and assert the dedup set makes the second
  pass a no-op.
- **Failure**: corrupt the registry store and assert rebuild-from-log produces
  an identical registry; simulate a crash between log and registry writes and
  assert recovery replays the log.
- **Unauthorized**: assert that an upgrade event from an unauthorized source is
  rejected and does not mutate the registry.
