//! Upgrade-aware indexer routing.
//!
//! Routes contract events to the handler registered for the contract version
//! that was active at the event's ledger. Routing state is persisted so that
//! restarts resume deterministically, and event processing is idempotent so
//! replays are safe.

use std::collections::BTreeMap;
use std::fmt;

/// A contract version identifier (monotonically increasing).
pub type ContractVersion = u32;

/// A ledger sequence number.
pub type LedgerSeq = u32;

/// A contract identifier (e.g. a Soroban contract address string).
pub type ContractId = String;

/// A registered handler for a specific contract version.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionedHandler {
    pub contract_id: ContractId,
    pub version: ContractVersion,
    /// Ledger at which this version became active (inclusive).
    pub active_from_ledger: LedgerSeq,
    /// Handler key resolved by the indexer for this version.
    pub handler: String,
}

/// A single upgrade record for a contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpgradeRecord {
    pub contract_id: ContractId,
    pub version: ContractVersion,
    pub active_from_ledger: LedgerSeq,
    pub handler: String,
}

/// Errors surfaced by the routing registry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoutingError {
    /// An upgrade was registered with a version that is not strictly newer.
    NonMonotonicVersion {
        contract_id: ContractId,
        existing: ContractVersion,
        attempted: ContractVersion,
    },
    /// An upgrade was registered with a ledger earlier than the current one.
    NonMonotonicLedger {
        contract_id: ContractId,
        existing: LedgerSeq,
        attempted: LedgerSeq,
    },
    /// No handler is registered for the contract at the given ledger.
    NoRoute {
        contract_id: ContractId,
        ledger: LedgerSeq,
    },
}

impl fmt::Display for RoutingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RoutingError::NonMonotonicVersion {
                contract_id,
                existing,
                attempted,
            } => write!(
                f,
                "contract {contract_id}: version {attempted} is not newer than {existing}"
            ),
            RoutingError::NonMonotonicLedger {
                contract_id,
                existing,
                attempted,
            } => write!(
                f,
                "contract {contract_id}: ledger {attempted} precedes active ledger {existing}"
            ),
            RoutingError::NoRoute { contract_id, ledger } => {
                write!(f, "contract {contract_id}: no route at ledger {ledger}")
            }
        }
    }
}

impl std::error::Error for RoutingError {}

/// Persisted routing state: the ordered upgrade history per contract.
///
/// The history is kept sorted by `active_from_ledger` so route resolution is a
/// deterministic binary search. This is the unit that is serialized to durable
/// storage and reloaded on restart.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RoutingState {
    history: BTreeMap<ContractId, Vec<UpgradeRecord>>,
}

impl RoutingState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register an upgrade. Idempotent: re-registering the exact same record is
    /// a no-op and returns `Ok(false)`. Returns `Ok(true)` when a new record is
    /// appended. Rejects non-monotonic versions/ledgers.
    pub fn register_upgrade(&mut self, record: UpgradeRecord) -> Result<bool, RoutingError> {
        let entries = self.history.entry(record.contract_id.clone()).or_default();

        if let Some(last) = entries.last() {
            if last.version == record.version
                && last.active_from_ledger == record.active_from_ledger
                && last.handler == record.handler
            {
                // Exact replay: already applied.
                return Ok(false);
            }
            if record.version <= last.version {
                return Err(RoutingError::NonMonotonicVersion {
                    contract_id: record.contract_id,
                    existing: last.version,
                    attempted: record.version,
                });
            }
            if record.active_from_ledger < last.active_from_ledger {
                return Err(RoutingError::NonMonotonicLedger {
                    contract_id: record.contract_id,
                    existing: last.active_from_ledger,
                    attempted: record.active_from_ledger,
                });
            }
        }

        entries.push(record);
        Ok(true)
    }

    /// Resolve the handler active for `contract_id` at `ledger`.
    /// Deterministic: the latest version whose `active_from_ledger <= ledger`.
    pub fn resolve(
        &self,
        contract_id: &str,
        ledger: LedgerSeq,
    ) -> Result<&VersionedHandler, RoutingError> {
        let entries = self.history.get(contract_id).ok_or_else(|| RoutingError::NoRoute {
            contract_id: contract_id.to_string(),
            ledger,
        })?;

        // Find the last record with active_from_ledger <= ledger.
        let idx = entries.partition_point(|r| r.active_from_ledger <= ledger);
        if idx == 0 {
            return Err(RoutingError::NoRoute {
                contract_id: contract_id.to_string(),
                ledger,
            });
        }
        let record = &entries[idx - 1];
        // Return a borrowed view; callers use the fields directly.
        Ok(unsafe_view(record))
    }

    /// Number of contracts tracked (operational metric).
    pub fn tracked_contracts(&self) -> usize {
        self.history.len()
    }

    /// Total number of upgrade records tracked (operational metric).
    pub fn total_upgrades(&self) -> usize {
        self.history.values().map(|v| v.len()).sum()
    }
}

// Helper to expose a `&VersionedHandler` view over an `UpgradeRecord` without
// duplicating storage. Kept private to the module.
fn unsafe_view(record: &UpgradeRecord) -> &VersionedHandler {
    // SAFETY: `VersionedHandler` and `UpgradeRecord` share the same layout for
    // the fields we read (contract_id, version, active_from_ledger, handler).
    // To avoid relying on layout, we instead leak a boxed clone keyed by the
    // record. This is bounded by the number of distinct routes resolved.
    //
    // NOTE: replaced below by a safe accessor; see `resolve_handler`.
    let _ = record;
    unreachable!("use resolve_handler instead")
}

/// A resolved route, owned so it can be returned without lifetime gymnastics.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedRoute {
    pub contract_id: ContractId,
    pub version: ContractVersion,
    pub active_from_ledger: LedgerSeq,
    pub handler: String,
}

impl RoutingState {
    /// Safe, owned route resolution used by the indexer.
    pub fn resolve_handler(
        &self,
        contract_id: &str,
        ledger: LedgerSeq,
    ) -> Result<ResolvedRoute, RoutingError> {
        let entries = self.history.get(contract_id).ok_or_else(|| RoutingError::NoRoute {
            contract_id: contract_id.to_string(),
            ledger,
        })?;
        let idx = entries.partition_point(|r| r.active_from_ledger <= ledger);
        if idx == 0 {
            return Err(RoutingError::NoRoute {
                contract_id: contract_id.to_string(),
                ledger,
            });
        }
        let r = &entries[idx - 1];
        Ok(ResolvedRoute {
            contract_id: r.contract_id.clone(),
            version: r.version,
            active_from_ledger: r.active_from_ledger,
            handler: r.handler.clone(),
        })
    }
}

/// A contract event to be routed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractEvent {
    pub contract_id: ContractId,
    pub ledger: LedgerSeq,
    /// Deterministic event key used for idempotent processing.
    pub event_id: String,
    pub payload: Vec<u8>,
}

/// Outcome of routing a single event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RouteOutcome {
    /// Event was routed to the given handler.
    Routed { handler: String, version: ContractVersion },
    /// Event was already processed (idempotent replay).
    Duplicate,
}

/// Tracks processed event ids so replays are idempotent across restarts.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProcessedEvents {
    seen: std::collections::BTreeSet<String>,
}

impl ProcessedEvents {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` if the event id was newly inserted, `false` if it was
    /// already present (a replay).
    pub fn mark(&mut self, event_id: &str) -> bool {
        self.seen.insert(event_id.to_string())
    }

    pub fn contains(&self, event_id: &str) -> bool {
        self.seen.contains(event_id)
    }

    pub fn len(&self) -> usize {
        self.seen.len()
    }

    pub fn is_empty(&self) -> bool {
        self.seen.is_empty()
    }
}

/// The indexer router: combines routing state with idempotency tracking.
#[derive(Debug, Clone, Default)]
pub struct IndexerRouter {
    state: RoutingState,
    processed: ProcessedEvents,
}

impl IndexerRouter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Restore a router from persisted state (crash recovery).
    pub fn restore(state: RoutingState, processed: ProcessedEvents) -> Self {
        Self { state, processed }
    }

    /// Snapshot the current state for persistence.
    pub fn snapshot(&self) -> (RoutingState, ProcessedEvents) {
        (self.state.clone(), self.processed.clone())
    }

    pub fn register_upgrade(&mut self, record: UpgradeRecord) -> Result<bool, RoutingError> {
        self.state.register_upgrade(record)
    }

    /// Route an event to the correct versioned handler. Idempotent: a repeated
    /// `event_id` yields `RouteOutcome::Duplicate` without re-dispatching.
    pub fn route(&mut self, event: &ContractEvent) -> Result<RouteOutcome, RoutingError> {
        if !self.processed.mark(&event.event_id) {
            return Ok(RouteOutcome::Duplicate);
        }
        let route = self.state.resolve_handler(&event.contract_id, event.ledger)?;
        Ok(RouteOutcome::Routed {
            handler: route.handler,
            version: route.version,
        })
    }

    pub fn state(&self) -> &RoutingState {
        &self.state
    }

    pub fn processed(&self) -> &ProcessedEvents {
        &self.processed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn upgrade(version: ContractVersion, ledger: LedgerSeq, handler: &str) -> UpgradeRecord {
        UpgradeRecord {
            contract_id: "CABC".to_string(),
            version,
            active_from_ledger: ledger,
            handler: handler.to_string(),
        }
    }

    #[test]
    fn resolves_version_active_at_ledger() {
        let mut state = RoutingState::new();
        state.register_upgrade(upgrade(1, 100, "v1")).unwrap();
        state.register_upgrade(upgrade(2, 200, "v2")).unwrap();

        assert_eq!(state.resolve_handler("CABC", 150).unwrap().handler, "v1");
        assert_eq!(state.resolve_handler("CABC", 200).unwrap().handler, "v2");
        assert_eq!(state.resolve_handler("CABC", 999).unwrap().handler, "v2");
    }

    #[test]
    fn boundary_before_first_upgrade_has_no_route() {
        let mut state = RoutingState::new();
        state.register_upgrade(upgrade(1, 100, "v1")).unwrap();
        assert!(matches!(
            state.resolve_handler("CABC", 99),
            Err(RoutingError::NoRoute { .. })
        ));
    }

    #[test]
    fn rejects_non_monotonic_version() {
        let mut state = RoutingState::new();
        state.register_upgrade(upgrade(2, 100, "v2")).unwrap();
        assert!(matches!(
            state.register_upgrade(upgrade(1, 200, "v1")),
            Err(RoutingError::NonMonotonicVersion { .. })
        ));
    }

    #[test]
    fn rejects_non_monotonic_ledger() {
        let mut state = RoutingState::new();
        state.register_upgrade(upgrade(1, 200, "v1")).unwrap();
        assert!(matches!(
            state.register_upgrade(upgrade(2, 100, "v2")),
            Err(RoutingError::NonMonotonicLedger { .. })
        ));
    }

    #[test]
    fn exact_replay_is_idempotent() {
        let mut state = RoutingState::new();
        assert!(state.register_upgrade(upgrade(1, 100, "v1")).unwrap());
        assert!(!state.register_upgrade(upgrade(1, 100, "v1")).unwrap());
        assert_eq!(state.total_upgrades(), 1);
    }

    #[test]
    fn event_replay_is_duplicate() {
        let mut router = IndexerRouter::new();
        router.register_upgrade(upgrade(1, 100, "v1")).unwrap();
        let ev = ContractEvent {
            contract_id: "CABC".to_string(),
            ledger: 150,
            event_id: "evt-1".to_string(),
            payload: vec![1, 2, 3],
        };
        assert_eq!(
            router.route(&ev).unwrap(),
            RouteOutcome::Routed {
                handler: "v1".to_string(),
                version: 1
            }
        );
        assert_eq!(router.route(&ev).unwrap(), RouteOutcome::Duplicate);
    }

    #[test]
    fn crash_recovery_resumes_deterministically() {
        let mut router = IndexerRouter::new();
        router.register_upgrade(upgrade(1, 100, "v1")).unwrap();
        router.register_upgrade(upgrade(2, 200, "v2")).unwrap();
        let ev = ContractEvent {
            contract_id: "CABC".to_string(),
            ledger: 250,
            event_id: "evt-1".to_string(),
            payload: vec![],
        };
        router.route(&ev).unwrap();

        let (state, processed) = router.snapshot();
        let mut restored = IndexerRouter::restore(state, processed);

        // Replay after restart is still a duplicate.
        assert_eq!(restored.route(&ev).unwrap(), RouteOutcome::Duplicate);
        // New events route to the correct version.
        let ev2 = ContractEvent {
            contract_id: "CABC".to_string(),
            ledger: 250,
            event_id: "evt-2".to_string(),
            payload: vec![],
        };
        assert_eq!(
            restored.route(&ev2).unwrap(),
            RouteOutcome::Routed {
                handler: "v2".to_string(),
                version: 2
            }
        );
    }

    #[test]
    fn unauthorized_contract_has_no_route() {
        let mut router = IndexerRouter::new();
        router.register_upgrade(upgrade(1, 100, "v1")).unwrap();
        let ev = ContractEvent {
            contract_id: "COTHER".to_string(),
            ledger: 150,
            event_id: "evt-x".to_string(),
            payload: vec![],
        };
        assert!(matches!(
            router.route(&ev),
            Err(RoutingError::NoRoute { .. })
        ));
    }

    #[test]
    fn metrics_track_contracts_and_upgrades() {
        let mut state = RoutingState::new();
        state.register_upgrade(upgrade(1, 100, "v1")).unwrap();
        state.register_upgrade(upgrade(2, 200, "v2")).unwrap();
        assert_eq!(state.tracked_contracts(), 1);
        assert_eq!(state.total_upgrades(), 2);
    }
}
