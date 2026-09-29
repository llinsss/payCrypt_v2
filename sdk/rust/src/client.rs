//! Rust client for the Soroban payment SDK.
//!
//! Provides idempotent submission helpers and a retry policy that only
//! retries operations that are safe to replay. Signed operations and
//! payment submissions are never retried blindly; instead the client
//! persists operation/payment IDs so callers can reconcile duplicates.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

/// Soroban error categories used to decide retryability.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SorobanErrorCategory {
    /// Transient network / RPC failure. Safe to retry.
    Transient,
    /// Timeout while waiting for a response. Safe to retry status checks.
    Timeout,
    /// The transaction was rejected by the network. Not retryable.
    Rejected,
    /// The transaction was included but failed. Not retryable.
    Failed,
    /// Unknown / unclassified error. Not retryable by default.
    Unknown,
}

impl SorobanErrorCategory {
    /// Classify a raw Soroban error string into a category.
    pub fn from_error(err: &str) -> Self {
        let lower = err.to_ascii_lowercase();
        if lower.contains("timeout") || lower.contains("timed out") {
            SorobanErrorCategory::Timeout
        } else if lower.contains("network")
            || lower.contains("connection")
            || lower.contains("unavailable")
            || lower.contains("rate limit")
        {
            SorobanErrorCategory::Transient
        } else if lower.contains("rejected") || lower.contains("invalid") {
            SorobanErrorCategory::Rejected
        } else if lower.contains("failed") || lower.contains("error") {
            SorobanErrorCategory::Failed
        } else {
            SorobanErrorCategory::Unknown
        }
    }

    /// Whether an error in this category may be retried.
    pub fn is_retryable(self) -> bool {
        matches!(
            self,
            SorobanErrorCategory::Transient | SorobanErrorCategory::Timeout
        )
    }
}

/// Status of a submitted transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransactionStatus {
    /// Submitted but not yet confirmed. Safe to poll.
    Pending,
    /// Confirmed successfully. Terminal.
    Success,
    /// Confirmed but failed. Terminal.
    Failed,
    /// Not found on the network. Safe to re-check.
    NotFound,
}

impl TransactionStatus {
    /// Whether polling the status of a transaction in this state is safe.
    pub fn is_retryable(self) -> bool {
        matches!(self, TransactionStatus::Pending | TransactionStatus::NotFound)
    }
}

/// The kind of operation being performed. Only safe operations are retried.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationKind {
    /// Submitting a signed transaction. Never retried automatically.
    SubmitSigned,
    /// Submitting a payment. Never retried automatically.
    SubmitPayment,
    /// Querying transaction status. Safe to retry.
    Status,
    /// Read-only simulation. Safe to retry.
    Simulate,
}

impl OperationKind {
    /// Whether this operation may be retried.
    pub fn is_retryable(self) -> bool {
        matches!(self, OperationKind::Status | OperationKind::Simulate)
    }
}

/// Retry policy configuration.
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        RetryPolicy {
            max_attempts: 3,
            base_delay: Duration::from_millis(200),
        }
    }
}

impl RetryPolicy {
    /// Decide whether an operation should be retried given its kind, the
    /// Soroban error category, and the transaction status (if known).
    pub fn should_retry(
        &self,
        kind: OperationKind,
        category: SorobanErrorCategory,
        status: Option<TransactionStatus>,
        attempt: u32,
    ) -> bool {
        if attempt >= self.max_attempts {
            return false;
        }
        if !kind.is_retryable() {
            return false;
        }
        if let Some(status) = status {
            if !status.is_retryable() {
                return false;
            }
        }
        category.is_retryable()
    }

    /// Exponential backoff delay for the given attempt (0-indexed).
    pub fn delay_for(&self, attempt: u32) -> Duration {
        self.base_delay * 2u32.saturating_pow(attempt)
    }
}

/// Persisted record of an operation for idempotency.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationRecord {
    pub operation_id: String,
    pub payment_id: Option<String>,
    pub kind: OperationKind,
    pub status: TransactionStatus,
}

/// In-memory idempotency store keyed by operation ID.
#[derive(Debug, Default)]
pub struct IdempotencyStore {
    records: Mutex<HashMap<String, OperationRecord>>,
}

impl IdempotencyStore {
    pub fn new() -> Self {
        IdempotencyStore {
            records: Mutex::new(HashMap::new()),
        }
    }

    /// Persist an operation record. Returns the existing record if the
    /// operation ID was already seen, preventing duplicate submissions.
    pub fn record(&self, record: OperationRecord) -> Option<OperationRecord> {
        let mut records = self.records.lock().expect("idempotency store poisoned");
        if let Some(existing) = records.get(&record.operation_id) {
            return Some(existing.clone());
        }
        records.insert(record.operation_id.clone(), record);
        None
    }

    /// Look up a previously persisted operation.
    pub fn get(&self, operation_id: &str) -> Option<OperationRecord> {
        let records = self.records.lock().expect("idempotency store poisoned");
        records.get(operation_id).cloned()
    }

    /// Update the status of a persisted operation.
    pub fn update_status(&self, operation_id: &str, status: TransactionStatus) {
        let mut records = self.records.lock().expect("idempotency store poisoned");
        if let Some(record) = records.get_mut(operation_id) {
            record.status = status;
        }
    }
}

/// Result of a submission attempt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubmitOutcome {
    /// A new submission was accepted.
    Submitted { operation_id: String },
    /// The operation was already submitted; the existing record is returned.
    Duplicate { operation_id: String },
}

/// Client wrapping submission and status operations with idempotency and
/// retry handling.
#[derive(Debug)]
pub struct Client {
    pub policy: RetryPolicy,
    pub store: IdempotencyStore,
}

impl Default for Client {
    fn default() -> Self {
        Client {
            policy: RetryPolicy::default(),
            store: IdempotencyStore::new(),
        }
    }
}

impl Client {
    pub fn new(policy: RetryPolicy) -> Self {
        Client {
            policy,
            store: IdempotencyStore::new(),
        }
    }

    /// Submit a payment idempotently. If the operation ID was already seen,
    /// the existing record is returned and no duplicate payment is made.
    pub fn submit_payment(
        &self,
        operation_id: &str,
        payment_id: &str,
    ) -> SubmitOutcome {
        let record = OperationRecord {
            operation_id: operation_id.to_string(),
            payment_id: Some(payment_id.to_string()),
            kind: OperationKind::SubmitPayment,
            status: TransactionStatus::Pending,
        };
        match self.store.record(record) {
            Some(_) => SubmitOutcome::Duplicate {
                operation_id: operation_id.to_string(),
            },
            None => SubmitOutcome::Submitted {
                operation_id: operation_id.to_string(),
            },
        }
    }

    /// Poll transaction status with retry. Only status operations are retried.
    pub fn poll_status(
        &self,
        operation_id: &str,
        mut fetch: impl FnMut() -> Result<TransactionStatus, String>,
    ) -> Result<TransactionStatus, String> {
        let mut attempt = 0u32;
        loop {
            match fetch() {
                Ok(status) => {
                    self.store.update_status(operation_id, status);
                    if status.is_retryable()
                        && self.policy.should_retry(
                            OperationKind::Status,
                            SorobanErrorCategory::Transient,
                            Some(status),
                            attempt,
                        )
                    {
                        attempt += 1;
                        continue;
                    }
                    return Ok(status);
                }
                Err(err) => {
                    let category = SorobanErrorCategory::from_error(&err);
                    if self.policy.should_retry(
                        OperationKind::Status,
                        category,
                        None,
                        attempt,
                    ) {
                        attempt += 1;
                        continue;
                    }
                    return Err(err);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_operations_are_not_retryable() {
        let policy = RetryPolicy::default();
        assert!(!policy.should_retry(
            OperationKind::SubmitSigned,
            SorobanErrorCategory::Transient,
            None,
            0,
        ));
        assert!(!policy.should_retry(
            OperationKind::SubmitPayment,
            SorobanErrorCategory::Timeout,
            None,
            0,
        ));
    }

    #[test]
    fn status_operations_are_retryable_on_transient_errors() {
        let policy = RetryPolicy::default();
        assert!(policy.should_retry(
            OperationKind::Status,
            SorobanErrorCategory::Transient,
            Some(TransactionStatus::Pending),
            0,
        ));
        assert!(!policy.should_retry(
            OperationKind::Status,
            SorobanErrorCategory::Rejected,
            Some(TransactionStatus::Pending),
            0,
        ));
    }

    #[test]
    fn terminal_status_is_not_retried() {
        let policy = RetryPolicy::default();
        assert!(!policy.should_retry(
            OperationKind::Status,
            SorobanErrorCategory::Transient,
            Some(TransactionStatus::Success),
            0,
        ));
        assert!(!policy.should_retry(
            OperationKind::Status,
            SorobanErrorCategory::Transient,
            Some(TransactionStatus::Failed),
            0,
        ));
    }

    #[test]
    fn duplicate_client_calls_do_not_duplicate_payments() {
        let client = Client::default();
        let first = client.submit_payment("op-1", "pay-1");
        assert_eq!(
            first,
            SubmitOutcome::Submitted {
                operation_id: "op-1".to_string()
            }
        );
        let second = client.submit_payment("op-1", "pay-1");
        assert_eq!(
            second,
            SubmitOutcome::Duplicate {
                operation_id: "op-1".to_string()
            }
        );
        let record = client.store.get("op-1").expect("record persisted");
        assert_eq!(record.payment_id.as_deref(), Some("pay-1"));
    }

    #[test]
    fn timeout_after_submission_is_reconciled_via_status() {
        let client = Client::default();
        client.submit_payment("op-2", "pay-2");

        // First status fetch times out, second succeeds as Pending.
        let mut calls = 0;
        let status = client
            .poll_status("op-2", || {
                calls += 1;
                if calls == 1 {
                    Err("request timed out".to_string())
                } else {
                    Ok(TransactionStatus::Pending)
                }
            })
            .expect("status resolved after retry");
        assert_eq!(status, TransactionStatus::Pending);
        assert_eq!(calls, 2);

        // The persisted record reflects the reconciled status.
        let record = client.store.get("op-2").expect("record persisted");
        assert_eq!(record.status, TransactionStatus::Pending);
    }

    #[test]
    fn retry_stops_at_max_attempts() {
        let policy = RetryPolicy {
            max_attempts: 2,
            base_delay: Duration::from_millis(1),
        };
        assert!(policy.should_retry(
            OperationKind::Status,
            SorobanErrorCategory::Timeout,
            None,
            1,
        ));
        assert!(!policy.should_retry(
            OperationKind::Status,
            SorobanErrorCategory::Timeout,
            None,
            2,
        ));
    }
}
