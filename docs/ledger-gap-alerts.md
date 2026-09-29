# Ledger Gap Alerts for Rust Indexers

This document specifies ledger gap detection and alerting for the Rust/Soroban
indexer. It covers persistence, idempotency, crash recovery, indexing, and
operational metrics, and defines the deterministic validation rules used by the
implementation and its tests.

## Scope

The indexer ingests ledgers sequentially. A **ledger gap** occurs when the next
ledger observed is greater than the last successfully indexed ledger plus one:

```
expected_next = last_indexed_ledger + 1
gap          = observed_ledger - expected_next   // > 0 means a gap
```

Gaps can be caused by upstream RPC lag, reorgs, or dropped ingestion batches.
The indexer must detect gaps, persist alert state, and emit exactly one alert
per distinct gap range.

## Types

```rust
/// A contiguous range of missing ledgers: [start, end] inclusive.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct LedgerGap {
    pub start: u32,
    pub end: u32,
}

impl LedgerGap {
    /// Number of missing ledgers in the range.
    pub fn len(&self) -> u32 {
        self.end.saturating_sub(self.start) + 1
    }

    pub fn is_empty(&self) -> bool {
        self.end < self.start
    }
}

/// Severity derived deterministically from gap size and threshold.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GapSeverity {
    /// Gap is at or below the warning threshold.
    Warning,
    /// Gap exceeds the critical threshold.
    Critical,
}

/// Persisted alert state for a single open gap.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GapAlert {
    pub gap: LedgerGap,
    pub severity: GapSeverity,
    /// Ledger at which the gap was first observed (idempotency key).
    pub first_seen_ledger: u32,
    /// Whether the alert has been emitted to the sink.
    pub emitted: bool,
}
```

## Deterministic validation

Detection is a pure function of `(last_indexed_ledger, observed_ledger, config)`.
Given identical inputs it must always produce identical output, with no reliance
on wall-clock time or unordered iteration.

```rust
#[derive(Clone, Copy, Debug)]
pub struct GapConfig {
    /// Gaps larger than this are Critical; otherwise Warning.
    pub critical_threshold: u32,
}

/// Returns the gap between the last indexed ledger and the observed ledger,
/// or `None` when there is no gap (observed == last + 1) or a regression.
pub fn detect_gap(last_indexed_ledger: u32, observed_ledger: u32) -> Option<LedgerGap> {
    let expected_next = last_indexed_ledger.saturating_add(1);
    if observed_ledger <= expected_next {
        return None; // contiguous or regression; not a forward gap
    }
    Some(LedgerGap {
        start: expected_next,
        end: observed_ledger - 1,
    })
}

pub fn classify(gap: &LedgerGap, config: &GapConfig) -> GapSeverity {
    if gap.len() > config.critical_threshold {
        GapSeverity::Critical
    } else {
        GapSeverity::Warning
    }
}
```

Boundary rules (covered by unit/property tests):

- `observed == last + 1` → no gap.
- `observed == last + 2` → gap of length 1 (`start == end`).
- `observed <= last` → regression, not a forward gap; no alert.
- `gap.len() == critical_threshold` → `Warning`; `> critical_threshold` → `Critical`.
- `last_indexed_ledger == u32::MAX` → saturating add, no overflow panic.

## Persistence

Gap/alert state is persisted so detection survives restarts. The store must be
updated atomically with the indexed-ledger cursor to avoid torn state.

```rust
pub trait GapStore {
    /// Last ledger successfully indexed (durable cursor).
    fn last_indexed_ledger(&self) -> Result<Option<u32>, StoreError>;
    fn set_last_indexed_ledger(&self, ledger: u32) -> Result<(), StoreError>;

    /// Open (unresolved) alerts keyed by gap start ledger.
    fn open_alerts(&self) -> Result<Vec<GapAlert>, StoreError>;
    fn upsert_alert(&self, alert: &GapAlert) -> Result<(), StoreError>;
    fn resolve_alert(&self, gap_start: u32) -> Result<(), StoreError>;
}
```

Persisted fields per alert: `gap.start`, `gap.end`, `severity`,
`first_seen_ledger`, `emitted`. The cursor (`last_indexed_ledger`) and the alert
set are written in the same transaction.

## Idempotency

Repeated detection of the same gap must not emit duplicate alerts. The
idempotency key is `(gap.start, gap.end)`:

1. On detection, look up an open alert with the same `gap.start`.
2. If none exists, insert a new alert with `emitted = false`.
3. If one exists with the same `gap.end`, do nothing (already tracked).
4. If one exists with a smaller `gap.end` (gap grew), update `gap.end` and
   re-classify severity, but keep `first_seen_ledger` and `emitted` unchanged.
5. Emit only when `emitted == false`; set `emitted = true` after a successful
   sink write.

This guarantees at-most-once emission per distinct gap range even under
repeated or concurrent detection.

## Crash recovery

On startup the indexer:

1. Loads `last_indexed_ledger` and the set of open alerts from the store.
2. Resumes ingestion from `last_indexed_ledger + 1`.
3. Re-evaluates the first observed ledger against the persisted cursor using
   `detect_gap`, so a gap that was open at crash time is re-detected.
4. Because alerts are keyed by `gap.start` and carry `emitted`, re-detection
   does not re-emit an already-emitted alert, and does not lose an alert that
   was persisted but not yet emitted.

If the process crashed after persisting an alert but before emitting it,
`emitted == false` causes the alert to be emitted on the next evaluation. If it
crashed after emitting but before marking `emitted`, the alert may be emitted
again; sinks must therefore be idempotent on `(gap.start, gap.end)`.

## Indexing

- The cursor advances only after a ledger is fully indexed and committed.
- Detection runs before advancing the cursor for the observed ledger.
- When a gap is detected, the indexer may either (a) backfill the missing range
  before advancing, or (b) advance and record the gap for later backfill. The
  chosen mode is configured; both persist the alert identically.
- When the missing range is later backfilled, `resolve_alert(gap.start)` is
  called and the alert is removed from the open set.

## Operational metrics

Emit the following metrics (Prometheus-style names):

| Metric | Type | Description |
| --- | --- | --- |
| `indexer_ledger_gap_detected_total` | counter | Gaps detected, labeled by `severity`. |
| `indexer_ledger_gap_open` | gauge | Currently open (unresolved) alerts. |
| `indexer_ledger_gap_size_ledgers` | histogram | Size of detected gaps in ledgers. |
| `indexer_ledger_gap_alert_emitted_total` | counter | Alerts emitted to the sink. |
| `indexer_ledger_gap_resolved_total` | counter | Alerts resolved via backfill. |
| `indexer_last_indexed_ledger` | gauge | Durable cursor value. |

Alerting rule: page when `indexer_ledger_gap_open{severity="critical"} > 0` for
more than 5 minutes, or when `indexer_last_indexed_ledger` stops advancing while
the upstream head advances.

## Migration

- Add the `gap_alerts` table (or equivalent key-value namespace) with columns
  `gap_start` (PK), `gap_end`, `severity`, `first_seen_ledger`, `emitted`.
- Backfill `last_indexed_ledger` from the existing cursor; if absent, initialize
  to the current head and start with an empty alert set.
- No data migration is required for existing indexed ledgers; alerts are derived
  state and can be rebuilt by re-evaluating the cursor against observed ledgers.

## Rollback

- Disabling gap alerts is a config flag; detection and persistence can be turned
  off without affecting ingestion.
- Dropping the `gap_alerts` table is safe: it holds only derived alert state.
- The durable cursor (`last_indexed_ledger`) must never be rolled back, as doing
  so would cause re-indexing; rollback only removes alert state.

## Tests

- **Unit**: `detect_gap` boundaries (contiguous, single-ledger gap, regression,
  `u32::MAX` saturation); `classify` at and around `critical_threshold`.
- **Property**: for arbitrary `(last, observed)`, `detect_gap` returns `None` iff
  `observed <= last + 1`, and any returned gap satisfies `start == last + 1` and
  `end == observed - 1`.
- **Idempotency**: detecting the same gap twice emits exactly one alert;
  growing a gap updates `end` without re-emitting.
- **Crash recovery**: persist an unemitted alert, restart, and assert it is
  emitted exactly once; persist an emitted alert and assert no re-emission.
- **Unauthorized/failure**: store write failures surface as `StoreError` and do
  not advance the cursor or mark `emitted`.
- **Local network**: run against a local Soroban network, drop a batch of
  ledgers, and assert a gap alert is raised and later resolved after backfill.
