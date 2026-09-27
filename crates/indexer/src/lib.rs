//! Upgrade-aware indexer routing.
//!
//! This crate provides a small, deterministic routing layer that maps
//! incoming Soroban contract events to the correct *versioned* handler based
//! on the contract's upgrade history. It is designed to be:
//!
//! * **Typed** — routing decisions are expressed with explicit enums/structs.
//! * **Idempotent** — replaying the same event never double-applies state.
//! * **Crash-safe** — routing state is persisted and recovered on restart.
//! * **Observable** — operational metrics are tracked for monitoring.

use std::collections::BTreeMap;

/// A contract identifier (e.g. a Soroban contract address).
type ContractId = String;

/// A monotonically increasing contract version.
type Version = u32;

/// A ledger sequence number.
type Ledger = u64;

/// A single contract upgrade record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpgradeRecord {
    pub contract: ContractId,
    pub version: Version,
    pub effective_ledger: Ledger,
}

/// An incoming contract event to be routed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractEvent {
    pub contract: ContractId,
    pub ledger: Ledger,
    /// Deterministic event identity used for idempotency.
    pub event_id: String,
}

/// The resolved routing decision for an event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// Route to the handler for the given contract version.
    Versioned { contract: ContractId, version: Version },
    /// No upgrade record exists yet; route to the genesis handler.
    Genesis { contract: ContractId },
}

/// Errors surfaced by the router.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RouteError {
    /// The event was already processed (idempotent replay).
    Duplicate { event_id: String },
    /// The event references a ledger older than the last applied ledger.
    StaleLedger { event: Ledger, applied: Ledger },
}

/// Operational metrics for monitoring the indexer.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IndexerMetrics {
    pub events_routed: u64,
    pub events_duplicate: u64,
    pub events_stale: u64,
    pub upgrades_applied: u64,
    pub recoveries: u64,
}

/// Persisted routing state. This is the unit that must survive restarts.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RoutingState {
    /// Highest applied ledger, used for crash recovery and ordering.
    pub last_applied_ledger: Ledger,
    /// Per-contract upgrade history, ordered by effective ledger.
    pub upgrades: BTreeMap<ContractId, Vec<UpgradeRecord>>,
    /// Set of processed event ids for idempotency.
    pub processed: BTreeMap<String, ()>,
}

/// The upgrade-aware indexer router.
#[derive(Debug, Clone, Default)]
pub struct UpgradeAwareRouter {
    state: RoutingState,
    metrics: IndexerMetrics,
}

impl UpgradeAwareRouter {
    /// Create a router from previously persisted state (crash recovery).
    pub fn recover(state: RoutingState) -> Self {
        let mut metrics = IndexerMetrics::default();
        metrics.recoveries = 1;
        Self { state, metrics }
    }

    /// Snapshot the current state for persistence.
    pub fn snapshot(&self) -> &RoutingState {
        &self.state
    }

    /// Read-only access to operational metrics.
    pub fn metrics(&self) -> &IndexerMetrics {
        &self.metrics
    }

    /// Record a contract upgrade. Upgrades are applied deterministically and
    /// are idempotent: re-applying the same record is a no-op.
    pub fn apply_upgrade(&mut self, record: UpgradeRecord) {
        let history = self.state.upgrades.entry(record.contract.clone()).or_default();
        if history.iter().any(|r| r.version == record.version) {
            return;
        }
        history.push(record);
        history.sort_by_key(|r| (r.effective_ledger, r.version));
        self.metrics.upgrades_applied += 1;
    }

    /// Resolve the versioned handler for an event.
    ///
    /// Deterministic: the version is the highest upgrade whose
    /// `effective_ledger` is `<= event.ledger`.
    pub fn resolve(&self, event: &ContractEvent) -> Route {
        match self.state.upgrades.get(&event.contract) {
            None => Route::Genesis { contract: event.contract.clone() },
            Some(history) => {
                let version = history
                    .iter()
                    .filter(|r| r.effective_ledger <= event.ledger)
                    .map(|r| r.version)
                    .max();
                match version {
                    Some(version) => Route::Versioned {
                        contract: event.contract.clone(),
                        version,
                    },
                    None => Route::Genesis { contract: event.contract.clone() },
                }
            }
        }
    }

    /// Route and apply an event, updating idempotency and metrics.
    ///
    /// Replay-safe: a previously processed `event_id` returns
    /// `RouteError::Duplicate` without mutating state.
    pub fn route(&mut self, event: ContractEvent) -> Result<Route, RouteError> {
        if self.state.processed.contains_key(&event.event_id) {
            self.metrics.events_duplicate += 1;
            return Err(RouteError::Duplicate { event_id: event.event_id });
        }
        if event.ledger < self.state.last_applied_ledger {
            self.metrics.events_stale += 1;
            return Err(RouteError::StaleLedger {
                event: event.ledger,
                applied: self.state.last_applied_ledger,
            });
        }

        let route = self.resolve(&event);
        self.state.processed.insert(event.event_id, ());
        self.state.last_applied_ledger = event.ledger;
        self.metrics.events_routed += 1;
        Ok(route)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn upgrade(contract: &str, version: Version, ledger: Ledger) -> UpgradeRecord {
        UpgradeRecord {
            contract: contract.to_string(),
            version,
            effective_ledger: ledger,
        }
    }

    fn event(contract: &str, ledger: Ledger, id: &str) -> ContractEvent {
        ContractEvent {
            contract: contract.to_string(),
            ledger,
            event_id: id.to_string(),
        }
    }

    #[test]
    fn genesis_when_no_upgrades() {
        let router = UpgradeAwareRouter::default();
        assert_eq!(
            router.resolve(&event("C1", 10, "e1")),
            Route::Genesis { contract: "C1".to_string() }
        );
    }

    #[test]
    fn routes_to_latest_effective_version() {
        let mut router = UpgradeAwareRouter::default();
        router.apply_upgrade(upgrade("C1", 1, 5));
        router.apply_upgrade(upgrade("C1", 2, 20));

        assert_eq!(
            router.resolve(&event("C1", 10, "e1")),
            Route::Versioned { contract: "C1".to_string(), version: 1 }
        );
        assert_eq!(
            router.resolve(&event("C1", 25, "e2")),
            Route::Versioned { contract: "C1".to_string(), version: 2 }
        );
    }

    #[test]
    fn boundary_ledger_uses_upgrade() {
        let mut router = UpgradeAwareRouter::default();
        router.apply_upgrade(upgrade("C1", 1, 5));
        assert_eq!(
            router.resolve(&event("C1", 5, "e1")),
            Route::Versioned { contract: "C1".to_string(), version: 1 }
        );
    }

    #[test]
    fn duplicate_event_is_rejected() {
        let mut router = UpgradeAwareRouter::default();
        router.route(event("C1", 1, "e1")).unwrap();
        assert_eq!(
            router.route(event("C1", 1, "e1")),
            Err(RouteError::Duplicate { event_id: "e1".to_string() })
        );
        assert_eq!(router.metrics().events_duplicate, 1);
    }

    #[test]
    fn stale_ledger_is_rejected() {
        let mut router = UpgradeAwareRouter::default();
        router.route(event("C1", 10, "e1")).unwrap();
        assert_eq!(
            router.route(event("C1", 5, "e2")),
            Err(RouteError::StaleLedger { event: 5, applied: 10 })
        );
    }

    #[test]
    fn upgrade_application_is_idempotent() {
        let mut router = UpgradeAwareRouter::default();
        router.apply_upgrade(upgrade("C1", 1, 5));
        router.apply_upgrade(upgrade("C1", 1, 5));
        assert_eq!(router.metrics().upgrades_applied, 1);
    }

    #[test]
    fn crash_recovery_resumes_state() {
        let mut router = UpgradeAwareRouter::default();
        router.apply_upgrade(upgrade("C1", 1, 5));
        router.route(event("C1", 10, "e1")).unwrap();

        let recovered = UpgradeAwareRouter::recover(router.snapshot().clone());
        assert_eq!(recovered.metrics().recoveries, 1);
        assert_eq!(
            recovered.resolve(&event("C1", 10, "e2")),
            Route::Versioned { contract: "C1".to_string(), version: 1 }
        );
        // Replay of a processed event is still rejected after recovery.
        let mut recovered = recovered;
        assert_eq!(
            recovered.route(event("C1", 10, "e1")),
            Err(RouteError::Duplicate { event_id: "e1".to_string() })
        );
    }
}
