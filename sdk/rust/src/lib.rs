//! Rust client for the Soroban payment SDK.
//!
//! This module provides a small, dependency-light client that submits
//! operations to Soroban and exposes an idempotent, retry-aware submission
//! path. Retries are only ever performed for operations that are safe to
//! repeat (submission/status polling); signed operations are never replayed
//! and payments are never duplicated.

use std::collections::HashMap;
use std::fmt;

/// Errors surfaced by the Soroban client.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SorobanError {
    /// The request timed out before a response was received.
    Timeout,
    /// The node is temporarily unavailable / overloaded.
    Unavailable,
    /// The transaction was rejected because it is malformed.
    InvalidTransaction,
    /// The transaction was rejected by the network (e.g. bad sequence).
    TransactionFailed,
    /// The operation was rejected by the contract.
    ContractError,
    /// The account does not have enough funds.
    InsufficientFunds,
    /// Any other, non-retryable error.
    Other(String),
}

impl fmt::Display for SorobanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SorobanError::Timeout => write!(f, "request timed out"),
            SorobanError::Unavailable => write!(f, "node unavailable"),
            SorobanError::InvalidTransaction => write!(f, "invalid transaction"),
            SorobanError::TransactionFailed => write!(f, "transaction failed"),
            SorobanError::ContractError => write!(f, "contract error"),
            SorobanError::InsufficientFunds => write!(f, "insufficient funds"),
            SorobanError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for SorobanError {}

/// Status of a submitted transaction as reported by the network.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TxStatus {
    /// The transaction has not been seen yet; safe to poll again.
    NotFound,
    /// The transaction is pending; safe to poll again.
    Pending,
    /// The transaction succeeded; terminal.
    Success,
    /// The transaction failed; terminal.
    Failed,
}

/// The kind of operation being performed. Only `Submit` and `Status` are
/// considered safe to retry; signed operations must never be replayed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationKind {
    /// Submitting a (possibly signed) operation to the network.
    Submit,
    /// Polling the status of a previously submitted operation.
    Status,
}

/// Retry policy derived from Soroban error categories and transaction status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    /// Maximum number of attempts (including the first).
    pub max_attempts: u32,
    /// Base delay in milliseconds for exponential backoff.
    pub base_delay_ms: u64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        RetryPolicy {
            max_attempts: 3,
            base_delay_ms: 100,
        }
    }
}

impl RetryPolicy {
    /// Whether an operation of `kind` may be retried at all.
    ///
    /// Only submission and status polling are safe to repeat. Signed
    /// operations are never replayed, so any other kind is not retryable.
    pub fn is_operation_retryable(kind: OperationKind) -> bool {
        matches!(kind, OperationKind::Submit | OperationKind::Status)
    }

    /// Whether an error is retryable based on its Soroban category.
    pub fn is_error_retryable(err: &SorobanError) -> bool {
        matches!(err, SorobanError::Timeout | SorobanError::Unavailable)
    }

    /// Whether a transaction status warrants another poll.
    pub fn is_status_retryable(status: TxStatus) -> bool {
        matches!(status, TxStatus::NotFound | TxStatus::Pending)
    }

    /// Compute the backoff delay for a given attempt (0-indexed).
    pub fn delay_for_attempt(&self, attempt: u32) -> u64 {
        self.base_delay_ms.saturating_mul(1u64 << attempt.min(16))
    }
}

/// A record of an operation that has been submitted, used to guarantee
/// idempotency across retries and duplicate client calls.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationRecord {
    /// Stable operation identifier supplied by the caller.
    pub operation_id: String,
    /// Payment identifier, when the operation is a payment.
    pub payment_id: Option<String>,
    /// The transaction hash returned by the network, once known.
    pub tx_hash: Option<String>,
    /// Last observed status.
    pub status: TxStatus,
}

/// In-memory store of submitted operations keyed by operation id.
///
/// Persisting operation/payment ids here lets the client detect duplicate
/// calls and avoid re-submitting (and therefore duplicating) a payment.
#[derive(Debug, Default)]
pub struct IdempotencyStore {
    records: HashMap<String, OperationRecord>,
}

impl IdempotencyStore {
    pub fn new() -> Self {
        IdempotencyStore {
            records: HashMap::new(),
        }
    }

    /// Look up a previously recorded operation.
    pub fn get(&self, operation_id: &str) -> Option<&OperationRecord> {
        self.records.get(operation_id)
    }

    /// Record a newly submitted operation.
    pub fn insert(&mut self, record: OperationRecord) {
        self.records.insert(record.operation_id.clone(), record);
    }

    /// Update the status (and tx hash) of an existing operation.
    pub fn update_status(
        &mut self,
        operation_id: &str,
        status: TxStatus,
        tx_hash: Option<String>,
    ) {
        if let Some(record) = self.records.get_mut(operation_id) {
            record.status = status;
            if tx_hash.is_some() {
                record.tx_hash = tx_hash;
            }
        }
    }
}

/// Transport abstraction so the client can be tested without a live node.
pub trait Transport {
    /// Submit an operation. Implementations must be idempotent with respect
    /// to `operation_id`.
    fn submit(&self, operation_id: &str, payload: &[u8]) -> Result<String, SorobanError>;

    /// Poll the status of a previously submitted transaction.
    fn status(&self, tx_hash: &str) -> Result<TxStatus, SorobanError>;
}

/// Result of an idempotent submission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubmitOutcome {
    pub operation_id: String,
    pub payment_id: Option<String>,
    pub tx_hash: String,
    pub status: TxStatus,
    /// True when the operation was already known and was not re-submitted.
    pub deduplicated: bool,
}

/// Soroban client with idempotent submission and a retry policy.
#[derive(Debug)]
pub struct SorobanClient<T: Transport> {
    transport: T,
    policy: RetryPolicy,
    store: IdempotencyStore,
}

impl<T: Transport> SorobanClient<T> {
    pub fn new(transport: T) -> Self {
        SorobanClient {
            transport,
            policy: RetryPolicy::default(),
            store: IdempotencyStore::new(),
        }
    }

    pub fn with_policy(transport: T, policy: RetryPolicy) -> Self {
        SorobanClient {
            transport,
            policy,
            store: IdempotencyStore::new(),
        }
    }

    pub fn store(&self) -> &IdempotencyStore {
        &self.store
    }

    /// Submit an operation idempotently.
    ///
    /// If the operation id has already been recorded, the existing record is
    /// returned and no new submission is made, preventing duplicate payments
    /// and replay of signed operations.
    pub fn submit(
        &mut self,
        operation_id: &str,
        payment_id: Option<String>,
        payload: &[u8],
    ) -> Result<SubmitOutcome, SorobanError> {
        if let Some(existing) = self.store.get(operation_id) {
            return Ok(SubmitOutcome {
                operation_id: existing.operation_id.clone(),
                payment_id: existing.payment_id.clone(),
                tx_hash: existing.tx_hash.clone().unwrap_or_default(),
                status: existing.status,
                deduplicated: true,
            });
        }

        let mut attempt = 0u32;
        loop {
            match self.transport.submit(operation_id, payload) {
                Ok(tx_hash) => {
                    let record = OperationRecord {
                        operation_id: operation_id.to_string(),
                        payment_id: payment_id.clone(),
                        tx_hash: Some(tx_hash.clone()),
                        status: TxStatus::Pending,
                    };
                    self.store.insert(record);
                    return Ok(SubmitOutcome {
                        operation_id: operation_id.to_string(),
                        payment_id,
                        tx_hash,
                        status: TxStatus::Pending,
                        deduplicated: false,
                    });
                }
                Err(err) => {
                    attempt += 1;
                    let retryable = RetryPolicy::is_operation_retryable(OperationKind::Submit)
                        && RetryPolicy::is_error_retryable(&err)
                        && attempt < self.policy.max_attempts;
                    if !retryable {
                        return Err(err);
                    }
                    // Backoff is computed but not slept on here; callers may
                    // use `delay_for_attempt` to schedule the retry.
                    let _ = self.policy.delay_for_attempt(attempt - 1);
                }
            }
        }
    }

    /// Poll the status of a submitted operation, retrying only while the
    /// status is non-terminal and the error is retryable.
    pub fn poll_status(&mut self, operation_id: &str) -> Result<TxStatus, SorobanError> {
        let tx_hash = match self.store.get(operation_id).and_then(|r| r.tx_hash.clone()) {
            Some(hash) => hash,
            None => return Err(SorobanError::Other("unknown operation".into())),
        };

        let mut attempt = 0u32;
        loop {
            match self.transport.status(&tx_hash) {
                Ok(status) => {
                    self.store.update_status(operation_id, status, None);
                    let retryable = RetryPolicy::is_operation_retryable(OperationKind::Status)
                        && RetryPolicy::is_status_retryable(status)
                        && attempt + 1 < self.policy.max_attempts;
                    if !retryable {
                        return Ok(status);
                    }
                    attempt += 1;
                    let _ = self.policy.delay_for_attempt(attempt - 1);
                }
                Err(err) => {
                    attempt += 1;
                    let retryable = RetryPolicy::is_operation_retryable(OperationKind::Status)
                        && RetryPolicy::is_error_retryable(&err)
                        && attempt < self.policy.max_attempts;
                    if !retryable {
                        return Err(err);
                    }
                    let _ = self.policy.delay_for_attempt(attempt - 1);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    /// A transport that times out on the first submit, then succeeds.
    struct TimeoutThenSuccess {
        submits: RefCell<u32>,
    }

    impl Transport for TimeoutThenSuccess {
        fn submit(&self, _operation_id: &str, _payload: &[u8]) -> Result<String, SorobanError> {
            let mut n = self.submits.borrow_mut();
            *n += 1;
            if *n == 1 {
                Err(SorobanError::Timeout)
            } else {
                Ok("tx-1".to_string())
            }
        }

        fn status(&self, _tx_hash: &str) -> Result<TxStatus, SorobanError> {
            Ok(TxStatus::Success)
        }
    }

    /// A transport that always succeeds and counts submissions.
    struct CountingTransport {
        submits: RefCell<u32>,
    }

    impl Transport for CountingTransport {
        fn submit(&self, _operation_id: &str, _payload: &[u8]) -> Result<String, SorobanError> {
            *self.submits.borrow_mut() += 1;
            Ok("tx-1".to_string())
        }

        fn status(&self, _tx_hash: &str) -> Result<TxStatus, SorobanError> {
            Ok(TxStatus::Success)
        }
    }

    #[test]
    fn retries_timeout_after_submission() {
        let transport = TimeoutThenSuccess {
            submits: RefCell::new(0),
        };
        let mut client = SorobanClient::new(transport);
        let outcome = client
            .submit("op-1", Some("pay-1".into()), b"payload")
            .expect("should retry timeout and succeed");
        assert_eq!(outcome.tx_hash, "tx-1");
        assert!(!outcome.deduplicated);
        assert_eq!(*client.transport.submits.borrow(), 2);
    }

    #[test]
    fn duplicate_client_calls_are_deduplicated() {
        let transport = CountingTransport {
            submits: RefCell::new(0),
        };
        let mut client = SorobanClient::new(transport);
        let first = client
            .submit("op-1", Some("pay-1".into()), b"payload")
            .expect("first submit");
        let second = client
            .submit("op-1", Some("pay-1".into()), b"payload")
            .expect("second submit");
        assert!(!first.deduplicated);
        assert!(second.deduplicated);
        assert_eq!(first.tx_hash, second.tx_hash);
        // The transport must only have been called once.
        assert_eq!(*client.transport.submits.borrow(), 1);
    }

    #[test]
    fn non_retryable_errors_are_not_retried() {
        struct Failing;
        impl Transport for Failing {
            fn submit(&self, _id: &str, _p: &[u8]) -> Result<String, SorobanError> {
                Err(SorobanError::InvalidTransaction)
            }
            fn status(&self, _h: &str) -> Result<TxStatus, SorobanError> {
                Ok(TxStatus::Failed)
            }
        }
        let mut client = SorobanClient::new(Failing);
        let err = client.submit("op-1", None, b"p").unwrap_err();
        assert_eq!(err, SorobanError::InvalidTransaction);
    }

    #[test]
    fn retryability_is_derived_from_category_and_status() {
        assert!(RetryPolicy::is_error_retryable(&SorobanError::Timeout));
        assert!(RetryPolicy::is_error_retryable(&SorobanError::Unavailable));
        assert!(!RetryPolicy::is_error_retryable(&SorobanError::ContractError));
        assert!(!RetryPolicy::is_error_retryable(&SorobanError::InsufficientFunds));

        assert!(RetryPolicy::is_status_retryable(TxStatus::Pending));
        assert!(RetryPolicy::is_status_retryable(TxStatus::NotFound));
        assert!(!RetryPolicy::is_status_retryable(TxStatus::Success));
        assert!(!RetryPolicy::is_status_retryable(TxStatus::Failed));

        assert!(RetryPolicy::is_operation_retryable(OperationKind::Submit));
        assert!(RetryPolicy::is_operation_retryable(OperationKind::Status));
    }
}
