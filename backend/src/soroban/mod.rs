//! Soroban transaction finality tracking.
//!
//! A submitted transaction is not equivalent to a finalized payment. This
//! module provides a typed lifecycle state plus cancellation-safe polling that
//! observes a submitted transaction until it reaches finality, explicitly
//! distinguishing pending, success, failure, timeout, and ledger-gap outcomes.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Instant};
use tokio_util::sync::CancellationToken;

/// Typed lifecycle state of a submitted Soroban transaction.
///
/// `Submitted` is deliberately distinct from `Success`: a transaction that has
/// been accepted into the network is not yet a finalized payment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum TxLifecycle {
    /// Accepted by the network but not yet included in a ledger.
    Submitted { hash: String },
    /// Included in a ledger and executed successfully.
    Success { hash: String, ledger: u32 },
    /// Included in a ledger but execution failed.
    Failure { hash: String, ledger: u32, reason: String },
    /// Not finalized within the configured deadline.
    Timeout { hash: String },
    /// A ledger sequence was missed or arrived out of order; finality cannot
    /// be determined from the observed stream and must be re-polled.
    LedgerGap { hash: String, expected: u32, observed: u32 },
}

impl TxLifecycle {
    /// Whether the lifecycle has reached a terminal state.
    pub fn is_final(&self) -> bool {
        matches!(
            self,
            TxLifecycle::Success { .. }
                | TxLifecycle::Failure { .. }
                | TxLifecycle::Timeout { .. }
        )
    }

    /// The transaction hash this state refers to.
    pub fn hash(&self) -> &str {
        match self {
            TxLifecycle::Submitted { hash }
            | TxLifecycle::Success { hash, .. }
            | TxLifecycle::Failure { hash, .. }
            | TxLifecycle::Timeout { hash }
            | TxLifecycle::LedgerGap { hash, .. } => hash,
        }
    }
}

/// A single observation of a transaction's status from the network.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TxObservation {
    /// Still pending; not yet included in a ledger.
    Pending,
    /// Included in `ledger` and executed successfully.
    Success { ledger: u32 },
    /// Included in `ledger` but execution failed.
    Failure { ledger: u32, reason: String },
    /// The ledger stream skipped or reordered relative to `expected`.
    LedgerGap { expected: u32, observed: u32 },
}

/// Source of transaction observations (RPC, subscription, mock, ...).
#[async_trait::async_trait]
pub trait TxObserver: Send + Sync {
    /// Fetch the current observation for `hash`.
    async fn observe(&self, hash: &str) -> Result<TxObservation, TxError>;
}

/// Errors surfaced while tracking finality.
#[derive(Debug, thiserror::Error)]
pub enum TxError {
    #[error("observer error: {0}")]
    Observer(String),
    #[error("transaction {0} not found")]
    NotFound(String),
}

/// Configuration for [`track_finality`].
#[derive(Debug, Clone)]
pub struct FinalityConfig {
    /// Delay between polls.
    pub poll_interval: Duration,
    /// Overall deadline before a `Timeout` is returned.
    pub timeout: Duration,
    /// Maximum consecutive ledger gaps tolerated before giving up.
    pub max_ledger_gaps: u32,
}

impl Default for FinalityConfig {
    fn default() -> Self {
        Self {
            poll_interval: Duration::from_secs(2),
            timeout: Duration::from_secs(60),
            max_ledger_gaps: 5,
        }
    }
}

/// Poll `observer` until `hash` reaches finality.
///
/// Cancellation-safe: when `cancel` is triggered the function returns promptly
/// without leaking tasks or losing the last observed state. Ledger gaps are
/// surfaced explicitly as [`TxLifecycle::LedgerGap`] and retried up to
/// `config.max_ledger_gaps` times rather than being treated as success/failure.
///
/// Returns the last observed lifecycle state on cancellation.
pub async fn track_finality<O: TxObserver>(
    observer: &O,
    hash: &str,
    config: FinalityConfig,
    cancel: CancellationToken,
) -> TxLifecycle {
    let deadline = Instant::now() + config.timeout;
    let mut gaps: u32 = 0;
    let mut last = TxLifecycle::Submitted {
        hash: hash.to_string(),
    };

    loop {
        if cancel.is_cancelled() {
            return last;
        }

        if Instant::now() >= deadline {
            return TxLifecycle::Timeout {
                hash: hash.to_string(),
            };
        }

        let observation = tokio::select! {
            biased;
            _ = cancel.cancelled() => return last,
            result = observer.observe(hash) => result,
        };

        match observation {
            Ok(TxObservation::Pending) => {
                last = TxLifecycle::Submitted {
                    hash: hash.to_string(),
                };
            }
            Ok(TxObservation::Success { ledger }) => {
                return TxLifecycle::Success {
                    hash: hash.to_string(),
                    ledger,
                };
            }
            Ok(TxObservation::Failure { ledger, reason }) => {
                return TxLifecycle::Failure {
                    hash: hash.to_string(),
                    ledger,
                    reason,
                };
            }
            Ok(TxObservation::LedgerGap { expected, observed }) => {
                gaps += 1;
                last = TxLifecycle::LedgerGap {
                    hash: hash.to_string(),
                    expected,
                    observed,
                };
                if gaps >= config.max_ledger_gaps {
                    return last;
                }
            }
            Err(TxError::NotFound(_)) => {
                last = TxLifecycle::Submitted {
                    hash: hash.to_string(),
                };
            }
            Err(TxError::Observer(_)) => {
                // Transient observer errors are retried until the deadline.
            }
        }

        tokio::select! {
            biased;
            _ = cancel.cancelled() => return last,
            _ = sleep(config.poll_interval) => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    struct ScriptedObserver {
        calls: AtomicU32,
        script: Vec<TxObservation>,
    }

    impl ScriptedObserver {
        fn new(script: Vec<TxObservation>) -> Self {
            Self {
                calls: AtomicU32::new(0),
                script,
            }
        }
    }

    #[async_trait::async_trait]
    impl TxObserver for ScriptedObserver {
        async fn observe(&self, _hash: &str) -> Result<TxObservation, TxError> {
            let idx = self.calls.fetch_add(1, Ordering::SeqCst) as usize;
            Ok(self
                .script
                .get(idx)
                .cloned()
                .unwrap_or(TxObservation::Pending))
        }
    }

    fn fast_config() -> FinalityConfig {
        FinalityConfig {
            poll_interval: Duration::from_millis(1),
            timeout: Duration::from_secs(5),
            max_ledger_gaps: 3,
        }
    }

    #[tokio::test]
    async fn delayed_transaction_reaches_success() {
        let observer = ScriptedObserver::new(vec![
            TxObservation::Pending,
            TxObservation::Pending,
            TxObservation::Success { ledger: 42 },
        ]);
        let state = track_finality(
            &observer,
            "abc",
            fast_config(),
            CancellationToken::new(),
        )
        .await;
        assert_eq!(
            state,
            TxLifecycle::Success {
                hash: "abc".into(),
                ledger: 42
            }
        );
        assert!(state.is_final());
    }

    #[tokio::test]
    async fn failed_transaction_is_reported() {
        let observer = ScriptedObserver::new(vec![TxObservation::Failure {
            ledger: 7,
            reason: "insufficient balance".into(),
        }]);
        let state = track_finality(
            &observer,
            "def",
            fast_config(),
            CancellationToken::new(),
        )
        .await;
        assert_eq!(
            state,
            TxLifecycle::Failure {
                hash: "def".into(),
                ledger: 7,
                reason: "insufficient balance".into()
            }
        );
    }

    #[tokio::test]
    async fn ledger_gap_is_surfaced_and_retried() {
        let observer = ScriptedObserver::new(vec![
            TxObservation::LedgerGap {
                expected: 10,
                observed: 12,
            },
            TxObservation::Success { ledger: 13 },
        ]);
        let state = track_finality(
            &observer,
            "ghi",
            fast_config(),
            CancellationToken::new(),
        )
        .await;
        assert_eq!(
            state,
            TxLifecycle::Success {
                hash: "ghi".into(),
                ledger: 13
            }
        );
    }

    #[tokio::test]
    async fn cancellation_returns_last_state() {
        let observer = Arc::new(ScriptedObserver::new(vec![TxObservation::Pending]));
        let cancel = CancellationToken::new();
        let token = cancel.clone();
        tokio::spawn(async move {
            sleep(Duration::from_millis(5)).await;
            token.cancel();
        });
        let state = track_finality(
            observer.as_ref(),
            "jkl",
            FinalityConfig {
                poll_interval: Duration::from_millis(50),
                timeout: Duration::from_secs(30),
                max_ledger_gaps: 3,
            },
            cancel,
        )
        .await;
        assert_eq!(
            state,
            TxLifecycle::Submitted {
                hash: "jkl".into()
            }
        );
    }
}
