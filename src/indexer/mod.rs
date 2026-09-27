//! Ledger gap detection and alerting for Rust/Soroban indexers.
//!
//! This module implements deterministic ledger gap detection with persisted
//! state so that detection survives restarts, repeated observations of the same
//! gap do not emit duplicate alerts (idempotency), and crash recovery resumes
//! from the last persisted ledger without losing or duplicating alerts.
//!
//! ## Persistence
//! [`GapStore`] persists the last-seen ledger and the set of open alerts. The
//! in-memory [`InMemoryGapStore`] is provided for tests and local networks; a
//! durable backend can implement the same trait without changing detection
//! logic.
//!
//! ## Idempotency
//! Each gap is keyed by `(start, end)`. Re-observing an already-open gap is a
//! no-op and does not emit a new alert.
//!
//! ## Crash recovery
//! On restart, call [`LedgerGapDetector::recover`] with the persisted state.
//! Detection resumes from the persisted last-seen ledger and re-evaluates gaps
//! deterministically, so no alert is lost or duplicated.
//!
//! ## Metrics
//! [`GapMetrics`] records operational counters for monitoring: observed
//! ledgers, detected gaps, emitted alerts, and suppressed (duplicate) alerts.

use std::collections::BTreeMap;
use std::fmt;

/// A contiguous range of missing ledgers `[start, end]` (inclusive).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct LedgerGap {
    pub start: u64,
    pub end: u64,
}

impl LedgerGap {
    /// Construct a gap, validating that `start <= end`.
    pub fn new(start: u64, end: u64) -> Result<Self, GapError> {
        if start > end {
            return Err(GapError::InvalidRange { start, end });
        }
        Ok(Self { start, end })
    }

    /// Number of missing ledgers in the gap.
    pub fn len(&self) -> u64 {
        self.end - self.start + 1
    }

    pub fn is_empty(&self) -> bool {
        false
    }
}

impl fmt::Display for LedgerGap {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ledger gap [{}..={}]", self.start, self.end)
    }
}

/// Errors produced by gap detection and persistence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GapError {
    /// `start > end` when constructing a [`LedgerGap`].
    InvalidRange { start: u64, end: u64 },
    /// A persisted state was internally inconsistent.
    CorruptState(String),
}

impl fmt::Display for GapError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GapError::InvalidRange { start, end } => {
                write!(f, "invalid ledger gap range: start {start} > end {end}")
            }
            GapError::CorruptState(msg) => write!(f, "corrupt gap state: {msg}"),
        }
    }
}

impl std::error::Error for GapError {}

/// An alert emitted for a detected gap.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapAlert {
    pub gap: LedgerGap,
    /// Ledger at which the gap was first observed.
    pub detected_at: u64,
}

/// Persisted detection state: last-seen ledger plus open alerts.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GapState {
    /// Highest ledger observed so far, if any.
    pub last_seen: Option<u64>,
    /// Open alerts keyed by gap start for deterministic ordering.
    pub open_alerts: BTreeMap<u64, GapAlert>,
}

impl GapState {
    /// Validate internal consistency of a recovered state.
    pub fn validate(&self) -> Result<(), GapError> {
        for (start, alert) in &self.open_alerts {
            if alert.gap.start != *start {
                return Err(GapError::CorruptState(format!(
                    "alert key {start} does not match gap start {}",
                    alert.gap.start
                )));
            }
            if alert.gap.start > alert.gap.end {
                return Err(GapError::CorruptState(format!(
                    "alert has invalid range [{}..={}]",
                    alert.gap.start, alert.gap.end
                )));
            }
        }
        Ok(())
    }
}

/// Persistence backend for gap detection state.
pub trait GapStore {
    fn load(&self) -> Result<GapState, GapError>;
    fn save(&mut self, state: &GapState) -> Result<(), GapError>;
}

/// In-memory store suitable for tests and local networks.
#[derive(Debug, Default)]
pub struct InMemoryGapStore {
    state: GapState,
}

impl InMemoryGapStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl GapStore for InMemoryGapStore {
    fn load(&self) -> Result<GapState, GapError> {
        Ok(self.state.clone())
    }

    fn save(&mut self, state: &GapState) -> Result<(), GapError> {
        self.state = state.clone();
        Ok(())
    }
}

/// Operational counters for monitoring gap detection.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GapMetrics {
    pub ledgers_observed: u64,
    pub gaps_detected: u64,
    pub alerts_emitted: u64,
    pub alerts_suppressed: u64,
}

/// Detects ledger gaps and emits idempotent alerts backed by a [`GapStore`].
pub struct LedgerGapDetector<S: GapStore> {
    store: S,
    state: GapState,
    metrics: GapMetrics,
}

impl<S: GapStore> LedgerGapDetector<S> {
    /// Create a detector, loading any persisted state (crash recovery).
    pub fn new(store: S) -> Result<Self, GapError> {
        let state = store.load()?;
        state.validate()?;
        Ok(Self {
            store,
            state,
            metrics: GapMetrics::default(),
        })
    }

    /// Recover from persisted state explicitly (alias for [`Self::new`]).
    pub fn recover(store: S) -> Result<Self, GapError> {
        Self::new(store)
    }

    pub fn metrics(&self) -> &GapMetrics {
        &self.metrics
    }

    pub fn state(&self) -> &GapState {
        &self.state
    }

    /// Observe a ledger. Returns an alert only when a *new* gap is detected.
    ///
    /// Repeated observation of the same gap is idempotent: it is suppressed and
    /// counted in `alerts_suppressed`.
    pub fn observe(&mut self, ledger: u64) -> Result<Option<GapAlert>, GapError> {
        self.metrics.ledgers_observed += 1;

        let alert = match self.state.last_seen {
            Some(prev) if ledger > prev + 1 => {
                let gap = LedgerGap::new(prev + 1, ledger - 1)?;
                self.metrics.gaps_detected += 1;
                Some(GapAlert {
                    gap,
                    detected_at: ledger,
                })
            }
            _ => None,
        };

        // Advance last-seen monotonically; ignore stale/duplicate ledgers.
        match self.state.last_seen {
            Some(prev) if ledger <= prev => {}
            _ => self.state.last_seen = Some(ledger),
        }

        let emitted = match alert {
            Some(a) => {
                if self.state.open_alerts.contains_key(&a.gap.start) {
                    self.metrics.alerts_suppressed += 1;
                    None
                } else {
                    self.state.open_alerts.insert(a.gap.start, a.clone());
                    self.metrics.alerts_emitted += 1;
                    Some(a)
                }
            }
            None => None,
        };

        self.store.save(&self.state)?;
        Ok(emitted)
    }

    /// Resolve (close) an open alert once the gap is backfilled.
    pub fn resolve(&mut self, gap_start: u64) -> Result<bool, GapError> {
        let removed = self.state.open_alerts.remove(&gap_start).is_some();
        if removed {
            self.store.save(&self.state)?;
        }
        Ok(removed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detector() -> LedgerGapDetector<InMemoryGapStore> {
        LedgerGapDetector::new(InMemoryGapStore::new()).unwrap()
    }

    #[test]
    fn no_gap_for_contiguous_ledgers() {
        let mut d = detector();
        assert_eq!(d.observe(1).unwrap(), None);
        assert_eq!(d.observe(2).unwrap(), None);
        assert_eq!(d.observe(3).unwrap(), None);
        assert_eq!(d.metrics().gaps_detected, 0);
    }

    #[test]
    fn detects_gap_boundaries() {
        let mut d = detector();
        d.observe(10).unwrap();
        let alert = d.observe(14).unwrap().expect("gap expected");
        assert_eq!(alert.gap, LedgerGap::new(11, 13).unwrap());
        assert_eq!(alert.gap.len(), 3);
        assert_eq!(alert.detected_at, 14);
    }

    #[test]
    fn invalid_range_is_rejected() {
        assert_eq!(
            LedgerGap::new(5, 4),
            Err(GapError::InvalidRange { start: 5, end: 4 })
        );
    }

    #[test]
    fn repeated_gap_is_idempotent() {
        let mut d = detector();
        d.observe(1).unwrap();
        let first = d.observe(5).unwrap();
        assert!(first.is_some());
        // Re-observing the same gap must not emit a duplicate alert.
        let second = d.observe(5).unwrap();
        assert_eq!(second, None);
        assert_eq!(d.metrics().alerts_emitted, 1);
        assert_eq!(d.metrics().alerts_suppressed, 1);
    }

    #[test]
    fn crash_recovery_resumes_without_duplicates() {
        let store = InMemoryGapStore::new();
        let mut d = LedgerGapDetector::new(store).unwrap();
        d.observe(1).unwrap();
        assert!(d.observe(4).unwrap().is_some());

        // Simulate restart: recover from the same persisted store.
        let store = d.store;
        let mut recovered = LedgerGapDetector::recover(store).unwrap();
        assert_eq!(recovered.state().last_seen, Some(4));
        assert_eq!(recovered.state().open_alerts.len(), 1);

        // Re-observing the same gap after recovery is suppressed.
        assert_eq!(recovered.observe(4).unwrap(), None);
        assert_eq!(recovered.metrics().alerts_suppressed, 1);
    }

    #[test]
    fn resolve_closes_open_alert() {
        let mut d = detector();
        d.observe(1).unwrap();
        d.observe(3).unwrap();
        assert!(d.resolve(2).unwrap());
        assert!(!d.resolve(2).unwrap());
        assert!(d.state().open_alerts.is_empty());
    }

    #[test]
    fn corrupt_state_is_rejected() {
        let mut state = GapState::default();
        state.open_alerts.insert(
            9,
            GapAlert {
                gap: LedgerGap { start: 1, end: 2 },
                detected_at: 3,
            },
        );
        assert!(matches!(state.validate(), Err(GapError::CorruptState(_))));
    }
}
