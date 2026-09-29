//! Ledger gap detection and alerting for Rust/Soroban indexers.
//!
//! This module provides a typed, deterministic implementation for detecting
//! gaps in the ledger sequence observed by an indexer and emitting alerts.
//!
//! Design goals (issue #858):
//! - Deterministic validation of gap boundaries and thresholds.
//! - Persistence of gap/alert state so detection survives restarts.
//! - Idempotency: repeated detection of the same gap must not emit duplicate
//!   alerts.
//! - Crash recovery: on restart, resume from persisted state and re-evaluate
//!   gaps without losing or duplicating alerts.
//! - Operational metrics for monitoring and alerting.
//!
//! The module is intentionally storage-agnostic: [`GapStateStore`] is a trait
//! that can be backed by any durable store (file, database, object storage).
//! A simple in-memory implementation is provided for tests and local networks.

use std::collections::BTreeMap;
use std::fmt;

/// A ledger sequence number.
pub type LedgerSeq = u32;

/// Configuration for ledger gap detection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapConfig {
    /// Minimum number of missing ledgers required to consider it a gap.
    /// A value of `1` means any single missing ledger is a gap.
    pub min_gap_size: u32,
    /// Maximum number of missing ledgers tolerated before an alert is raised.
    /// Gaps larger than this are considered critical.
    pub alert_threshold: u32,
}

impl Default for GapConfig {
    fn default() -> Self {
        Self {
            min_gap_size: 1,
            alert_threshold: 1,
        }
    }
}

impl GapConfig {
    /// Validate the configuration. Returns an error for invalid thresholds.
    pub fn validate(&self) -> Result<(), GapError> {
        if self.min_gap_size == 0 {
            return Err(GapError::InvalidConfig(
                "min_gap_size must be greater than zero".to_string(),
            ));
        }
        if self.alert_threshold < self.min_gap_size {
            return Err(GapError::InvalidConfig(
                "alert_threshold must be >= min_gap_size".to_string(),
            ));
        }
        Ok(())
    }
}

/// A detected gap between two observed ledger sequences.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct LedgerGap {
    /// The last ledger observed before the gap.
    pub from: LedgerSeq,
    /// The next ledger observed after the gap.
    pub to: LedgerSeq,
}

impl LedgerGap {
    /// Number of missing ledgers in this gap.
    pub fn size(&self) -> u32 {
        self.to.saturating_sub(self.from).saturating_sub(1)
    }

    /// Deterministic identity for idempotency. Two gaps with the same
    /// boundaries are considered the same gap.
    pub fn key(&self) -> GapKey {
        GapKey {
            from: self.from,
            to: self.to,
        }
    }
}

/// Stable identity for a gap, used for idempotent alert emission.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GapKey {
    pub from: LedgerSeq,
    pub to: LedgerSeq,
}

impl fmt::Display for GapKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}..{}", self.from, self.to)
    }
}

/// Severity of a gap alert.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GapSeverity {
    /// Gap is at or above `min_gap_size` but below `alert_threshold`.
    Warning,
    /// Gap is at or above `alert_threshold`.
    Critical,
}

/// An alert emitted for a detected gap.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapAlert {
    pub key: GapKey,
    pub size: u32,
    pub severity: GapSeverity,
}

/// Persisted state for gap detection.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GapState {
    /// The highest ledger sequence observed so far.
    pub last_seen: Option<LedgerSeq>,
    /// Open (unresolved) alerts keyed by gap identity.
    pub open_alerts: BTreeMap<GapKey, GapAlert>,
}

/// Errors produced by gap detection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GapError {
    InvalidConfig(String),
    Storage(String),
}

impl fmt::Display for GapError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GapError::InvalidConfig(msg) => write!(f, "invalid gap config: {msg}"),
            GapError::Storage(msg) => write!(f, "gap storage error: {msg}"),
        }
    }
}

impl std::error::Error for GapError {}

/// Durable store for gap detection state.
///
/// Implementations must persist state so that detection survives restarts.
/// `load` must return the last persisted state (or default on first run) and
/// `save` must durably write the state before returning.
pub trait GapStateStore {
    fn load(&self) -> Result<GapState, GapError>;
    fn save(&self, state: &GapState) -> Result<(), GapError>;
}

/// In-memory store for tests and local networks.
#[derive(Debug, Default)]
pub struct MemoryGapStateStore {
    state: std::sync::Mutex<GapState>,
}

impl MemoryGapStateStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl GapStateStore for MemoryGapStateStore {
    fn load(&self) -> Result<GapState, GapError> {
        Ok(self.state.lock().expect("gap state lock poisoned").clone())
    }

    fn save(&self, state: &GapState) -> Result<(), GapError> {
        *self.state.lock().expect("gap state lock poisoned") = state.clone();
        Ok(())
    }
}

/// Operational metrics for gap detection.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GapMetrics {
    /// Total ledgers observed.
    pub ledgers_observed: u64,
    /// Total gaps detected (including duplicates across restarts).
    pub gaps_detected: u64,
    /// Total alerts emitted (deduplicated).
    pub alerts_emitted: u64,
    /// Total alerts resolved (gap closed).
    pub alerts_resolved: u64,
}

/// The ledger gap detector.
///
/// It is deterministic: given the same sequence of observed ledgers and the
/// same persisted state, it produces the same alerts.
pub struct LedgerGapDetector<S: GapStateStore> {
    config: GapConfig,
    store: S,
    state: GapState,
    metrics: GapMetrics,
}

impl<S: GapStateStore> LedgerGapDetector<S> {
    /// Create a detector, loading persisted state for crash recovery.
    pub fn new(config: GapConfig, store: S) -> Result<Self, GapError> {
        config.validate()?;
        let state = store.load()?;
        Ok(Self {
            config,
            store,
            state,
            metrics: GapMetrics::default(),
        })
    }

    /// Current metrics snapshot.
    pub fn metrics(&self) -> &GapMetrics {
        &self.metrics
    }

    /// Current persisted state snapshot.
    pub fn state(&self) -> &GapState {
        &self.state
    }

    /// Observe a ledger sequence and return any newly emitted alerts.
    ///
    /// Idempotent: observing the same ledger again does not re-emit alerts.
    pub fn observe(&mut self, ledger: LedgerSeq) -> Result<Vec<GapAlert>, GapError> {
        self.metrics.ledgers_observed += 1;

        let mut emitted = Vec::new();

        match self.state.last_seen {
            None => {
                // First observation: nothing to compare against.
                self.state.last_seen = Some(ledger);
            }
            Some(last) => {
                if ledger <= last {
                    // Replay or out-of-order observation: no new gap.
                    // Do not advance last_seen backwards.
                    return Ok(emitted);
                }

                let gap = LedgerGap {
                    from: last,
                    to: ledger,
                };

                if gap.size() >= self.config.min_gap_size {
                    self.metrics.gaps_detected += 1;
                    let key = gap.key();
                    let severity = if gap.size() >= self.config.alert_threshold {
                        GapSeverity::Critical
                    } else {
                        GapSeverity::Warning
                    };
                    let alert = GapAlert {
                        key,
                        size: gap.size(),
                        severity,
                    };

                    // Idempotency: only emit if not already open.
                    if !self.state.open_alerts.contains_key(&key) {
                        self.state.open_alerts.insert(key, alert.clone());
                        self.metrics.alerts_emitted += 1;
                        emitted.push(alert);
                    }
                }

                self.state.last_seen = Some(ledger);
            }
        }

        self.store.save(&self.state)?;
        Ok(emitted)
    }

    /// Resolve an open alert once the gap has been filled.
    pub fn resolve(&mut self, key: GapKey) -> Result<bool, GapError> {
        let removed = self.state.open_alerts.remove(&key).is_some();
        if removed {
            self.metrics.alerts_resolved += 1;
            self.store.save(&self.state)?;
        }
        Ok(removed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detector() -> LedgerGapDetector<MemoryGapStateStore> {
        LedgerGapDetector::new(GapConfig::default(), MemoryGapStateStore::new()).unwrap()
    }

    #[test]
    fn no_gap_for_contiguous_ledgers() {
        let mut d = detector();
        assert!(d.observe(1).unwrap().is_empty());
        assert!(d.observe(2).unwrap().is_empty());
        assert!(d.observe(3).unwrap().is_empty());
        assert_eq!(d.metrics().gaps_detected, 0);
    }

    #[test]
    fn detects_gap_and_emits_alert() {
        let mut d = detector();
        d.observe(1).unwrap();
        let alerts = d.observe(5).unwrap();
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].key, GapKey { from: 1, to: 5 });
        assert_eq!(alerts[0].size, 3);
        assert_eq!(alerts[0].severity, GapSeverity::Critical);
    }

    #[test]
    fn idempotent_on_replay() {
        let mut d = detector();
        d.observe(1).unwrap();
        let first = d.observe(5).unwrap();
        assert_eq!(first.len(), 1);
        // Replay the same ledger: no duplicate alert.
        let second = d.observe(5).unwrap();
        assert!(second.is_empty());
        assert_eq!(d.metrics().alerts_emitted, 1);
    }

    #[test]
    fn boundary_min_gap_size() {
        let config = GapConfig {
            min_gap_size: 2,
            alert_threshold: 2,
        };
        let mut d = LedgerGapDetector::new(config, MemoryGapStateStore::new()).unwrap();
        d.observe(1).unwrap();
        // Single missing ledger (size 1) is below min_gap_size.
        assert!(d.observe(3).unwrap().is_empty());
        // Two missing ledgers (size 2) meets the threshold.
        let alerts = d.observe(6).unwrap();
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].size, 2);
    }

    #[test]
    fn warning_below_alert_threshold() {
        let config = GapConfig {
            min_gap_size: 1,
            alert_threshold: 5,
        };
        let mut d = LedgerGapDetector::new(config, MemoryGapStateStore::new()).unwrap();
        d.observe(1).unwrap();
        let alerts = d.observe(3).unwrap();
        assert_eq!(alerts[0].severity, GapSeverity::Warning);
    }

    #[test]
    fn invalid_config_rejected() {
        let config = GapConfig {
            min_gap_size: 0,
            alert_threshold: 1,
        };
        assert!(LedgerGapDetector::new(config, MemoryGapStateStore::new()).is_err());
    }

    #[test]
    fn crash_recovery_resumes_from_persisted_state() {
        let store = MemoryGapStateStore::new();
        {
            let mut d = LedgerGapDetector::new(GapConfig::default(), &store).unwrap();
            d.observe(1).unwrap();
            d.observe(5).unwrap();
        }
        // Simulate restart: new detector loads persisted state.
        let mut d = LedgerGapDetector::new(GapConfig::default(), &store).unwrap();
        assert_eq!(d.state().last_seen, Some(5));
        // Re-observing the same gap does not duplicate the alert.
        assert!(d.observe(5).unwrap().is_empty());
        assert_eq!(d.metrics().alerts_emitted, 0);
    }

    #[test]
    fn resolve_alert() {
        let mut d = detector();
        d.observe(1).unwrap();
        d.observe(5).unwrap();
        let key = GapKey { from: 1, to: 5 };
        assert!(d.resolve(key).unwrap());
        assert!(!d.resolve(key).unwrap());
        assert_eq!(d.metrics().alerts_resolved, 1);
    }
}
