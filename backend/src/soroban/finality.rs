//! Soroban transaction finality tracking.
//!
//! A submitted transaction is not equivalent to a finalized payment. This
//! module provides a typed lifecycle state and cancellation-safe polling that
//! observes a submitted Soroban transaction until it reaches finality,
//! distinguishing pending, success, failure, timeout, and ledger-gap outcomes.

use std::future::Future;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Typed lifecycle state of a submitted Soroban transaction.
///
/// `Submitted` is deliberately distinct from `Success`: a transaction that has
/// been accepted into the mempool is not yet a finalized payment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum FinalityState {
    /// The transaction has been submitted but not yet observed in a ledger.
    Submitted,
    /// The transaction is included in a ledger but finality is not yet reached.
    Pending { ledger: u32 },
    /// The transaction was included and executed successfully.
    Success { ledger: u32 },
    /// The transaction was included but execution failed.
    Failure { ledger: u32, reason: String },
    /// Finality was not observed within the configured deadline.
    Timeout { last_ledger: Option<u32> },
    /// A ledger sequence gap was detected while tracking finality.
    LedgerGap { expected: u32, observed: u32 },
}

impl FinalityState {
    /// Returns `true` once the transaction has reached a terminal state.
    pub fn is_final(&self) -> bool {
        matches!(
            self,
            FinalityState::Success { .. }
                | FinalityState::Failure { .. }
                | FinalityState::Timeout { .. }
                | FinalityState::LedgerGap { .. }
        )
    }
}

/// A single observation of a submitted transaction against the chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Observation {
    /// Not yet seen in any ledger.
    NotFound,
    /// Seen in `ledger` and executed successfully.
    Succeeded { ledger: u32 },
    /// Seen in `ledger` and execution failed with `reason`.
    Failed { ledger: u32, reason: String },
}

/// Errors surfaced by the observation source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FinalityError {
    /// The observation source could not be reached.
    Unavailable(String),
}

/// Source used to observe a submitted transaction and the current ledger.
///
/// Implementations may poll an RPC endpoint or subscribe to a stream; the
/// tracker only depends on this narrow interface.
#[allow(async_fn_in_trait)]
pub trait FinalitySource {
    /// Returns the latest known ledger sequence.
    async fn latest_ledger(&self) -> Result<u32, FinalityError>;

    /// Observes the transaction identified by `tx_hash`.
    async fn observe(&self, tx_hash: &str) -> Result<Observation, FinalityError>;
}

/// Configuration for [`track_finality`].
#[derive(Debug, Clone)]
pub struct FinalityConfig {
    /// How long to wait between observations.
    pub poll_interval: Duration,
    /// Maximum time to wait for finality before returning `Timeout`.
    pub timeout: Duration,
}

impl Default for FinalityConfig {
    fn default() -> Self {
        Self {
            poll_interval: Duration::from_secs(2),
            timeout: Duration::from_secs(60),
        }
    }
}

/// Tracks a submitted transaction until it reaches a terminal [`FinalityState`].
///
/// Polling is cancellation-safe: dropping the returned future (or cancelling
/// the surrounding task) stops all work immediately, leaks no tasks, and loses
/// no state — the caller simply observes no further updates. Ledger sequence
/// gaps are reported explicitly as [`FinalityState::LedgerGap`] rather than
/// being treated as success or failure.
///
pub async fn track_finality<S, C>(
    source: &S,
    tx_hash: &str,
    config: FinalityConfig,
    cancel: C,
) -> FinalityState
where
    S: FinalitySource,
    C: Future<Output = ()>,
{
    tokio::pin!(cancel);

    let deadline = tokio::time::Instant::now() + config.timeout;
    let mut last_ledger: Option<u32> = None;

    loop {
        // Cancellation-safe wait: whichever branch completes first wins and the
        // other is dropped without leaking a task.
        let tick = tokio::time::sleep(config.poll_interval);
        tokio::select! {
            biased;
            _ = &mut cancel => {
                return FinalityState::Timeout { last_ledger };
            }
            _ = tick => {}
        }

        if tokio::time::Instant::now() >= deadline {
            return FinalityState::Timeout { last_ledger };
        }

        let current = match source.latest_ledger().await {
            Ok(ledger) => ledger,
            Err(_) => continue,
        };

        // Detect a ledger gap before interpreting the observation.
        if let Some(prev) = last_ledger {
            if current > prev + 1 {
                return FinalityState::LedgerGap {
                    expected: prev + 1,
                    observed: current,
                };
            }
        }
        last_ledger = Some(current);

        match source.observe(tx_hash).await {
            Ok(Observation::NotFound) => continue,
            Ok(Observation::Succeeded { ledger }) => {
                return FinalityState::Success { ledger };
            }
            Ok(Observation::Failed { ledger, reason }) => {
                return FinalityState::Failure { ledger, reason };
            }
            Err(_) => continue,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    struct MockSource {
        ledger: AtomicU32,
        observations: Vec<Observation>,
        calls: AtomicU32,
    }

    impl MockSource {
        fn new(ledger: u32, observations: Vec<Observation>) -> Self {
            Self {
                ledger: AtomicU32::new(ledger),
                observations,
                calls: AtomicU32::new(0),
            }
        }
    }

    impl FinalitySource for MockSource {
        async fn latest_ledger(&self) -> Result<u32, FinalityError> {
            Ok(self.ledger.load(Ordering::SeqCst))
        }

        async fn observe(&self, _tx_hash: &str) -> Result<Observation, FinalityError> {
            let idx = self.calls.fetch_add(1, Ordering::SeqCst) as usize;
            Ok(self
                .observations
                .get(idx)
                .cloned()
                .unwrap_or(Observation::NotFound))
        }
    }

    fn fast_config() -> FinalityConfig {
        FinalityConfig {
            poll_interval: Duration::from_millis(1),
            timeout: Duration::from_secs(5),
        }
    }

    #[tokio::test]
    async fn delayed_transaction_reaches_success() {
        let source = MockSource::new(
            10,
            vec![
                Observation::NotFound,
                Observation::NotFound,
                Observation::Succeeded { ledger: 10 },
            ],
        );
        let state = track_finality(&source, "tx", fast_config(), std::future::pending()).await;
        assert_eq!(state, FinalityState::Success { ledger: 10 });
    }

    #[tokio::test]
    async fn failed_transaction_reports_failure() {
        let source = MockSource::new(
            11,
            vec![Observation::Failed {
                ledger: 11,
                reason: "insufficient balance".into(),
            }],
        );
        let state = track_finality(&source, "tx", fast_config(), std::future::pending()).await;
        assert_eq!(
            state,
            FinalityState::Failure {
                ledger: 11,
                reason: "insufficient balance".into(),
            }
        );
    }

    #[tokio::test]
    async fn cancellation_is_safe() {
        let source = MockSource::new(5, vec![Observation::NotFound]);
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let cancel = async move {
            let _ = rx.await;
        };
        let handle = tokio::spawn(async move {
            track_finality(&source, "tx", fast_config(), cancel).await
        });
        tx.send(()).unwrap();
        let state = handle.await.unwrap();
        assert!(matches!(state, FinalityState::Timeout { .. }));
    }

    #[tokio::test]
    async fn ledger_gap_is_reported() {
        let source = Arc::new(MockSource::new(10, vec![Observation::NotFound]));
        let source2 = source.clone();
        let handle = tokio::spawn(async move {
            track_finality(&*source2, "tx", fast_config(), std::future::pending()).await
        });
        tokio::time::sleep(Duration::from_millis(5)).await;
        source.ledger.store(20, Ordering::SeqCst);
        let state = handle.await.unwrap();
        assert!(matches!(state, FinalityState::LedgerGap { .. }));
    }
}
