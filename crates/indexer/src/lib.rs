//! Soroban indexer crate.
//!
//! This crate defines the canonical payment model used by the Rust indexer
//! during the Soroban migration. It provides typed representations of
//! canonical payments, deterministic validation, persistence semantics,
//! idempotency handling, crash recovery checkpoints, and operational metrics.

use std::collections::HashMap;

/// A canonical payment as observed on-chain and normalized by the indexer.
///
/// The model is intentionally minimal and deterministic: every field is
/// required and validated before a payment is persisted or emitted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalPayment {
    /// Ledger sequence in which the payment was observed.
    pub ledger: u32,
    /// Transaction hash (hex, lowercase) that produced the payment.
    pub tx_hash: String,
    /// Zero-based operation index within the transaction.
    pub op_index: u32,
    /// Source account (StrKey, e.g. `G...`).
    pub from: String,
    /// Destination account (StrKey, e.g. `G...`).
    pub to: String,
    /// Asset identifier: `native` or `CODE:ISSUER`.
    pub asset: String,
    /// Amount in stroops (i128 to avoid overflow on large transfers).
    pub amount: i128,
}

/// Deterministic identity of a canonical payment.
///
/// Two observations with the same identity MUST be treated as the same
/// payment. This is the basis for idempotent persistence.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PaymentId {
    pub ledger: u32,
    pub tx_hash: String,
    pub op_index: u32,
}

impl CanonicalPayment {
    /// Returns the deterministic identity for this payment.
    pub fn id(&self) -> PaymentId {
        PaymentId {
            ledger: self.ledger,
            tx_hash: self.tx_hash.clone(),
            op_index: self.op_index,
        }
    }

    /// Deterministic validation of a canonical payment.
    ///
    /// Returns `Ok(())` when the payment is well-formed, otherwise a
    /// `ValidationError` describing the first violated invariant. The order
    /// of checks is fixed so results are reproducible across runs.
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.ledger == 0 {
            return Err(ValidationError::ZeroLedger);
        }
        if !is_valid_hash(&self.tx_hash) {
            return Err(ValidationError::InvalidTxHash);
        }
        if !is_valid_account(&self.from) {
            return Err(ValidationError::InvalidFrom);
        }
        if !is_valid_account(&self.to) {
            return Err(ValidationError::InvalidTo);
        }
        if !is_valid_asset(&self.asset) {
            return Err(ValidationError::InvalidAsset);
        }
        if self.amount <= 0 {
            return Err(ValidationError::NonPositiveAmount);
        }
        Ok(())
    }
}

/// Validation failures for a canonical payment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    ZeroLedger,
    InvalidTxHash,
    InvalidFrom,
    InvalidTo,
    InvalidAsset,
    NonPositiveAmount,
}

fn is_valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn is_valid_account(account: &str) -> bool {
    account.len() == 56 && account.starts_with('G')
}

fn is_valid_asset(asset: &str) -> bool {
    if asset == "native" {
        return true;
    }
    match asset.split_once(':') {
        Some((code, issuer)) => {
            (1..=12).contains(&code.len())
                && code.bytes().all(|b| b.is_ascii_alphanumeric())
                && is_valid_account(issuer)
        }
        None => false,
    }
}

/// Persistence semantics for canonical payments.
///
/// Implementations MUST be idempotent: writing the same `PaymentId` more than
/// once is a no-op and MUST NOT create duplicate rows or emit duplicate events.
/// Writes MUST be atomic with respect to the checkpoint so that crash recovery
/// can resume deterministically.
pub trait PaymentStore {
    /// Persist a payment idempotently. Returns `true` if newly inserted,
    /// `false` if the payment already existed.
    fn upsert(&mut self, payment: &CanonicalPayment) -> Result<bool, StoreError>;

    /// Return the last durably committed ledger checkpoint, if any.
    fn checkpoint(&self) -> Option<u32>;

    /// Durably record a ledger checkpoint. Must be atomic with `upsert`.
    fn set_checkpoint(&mut self, ledger: u32) -> Result<(), StoreError>;
}

/// Errors surfaced by a `PaymentStore`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    /// The payment failed deterministic validation.
    Invalid(ValidationError),
    /// The underlying storage backend failed.
    Backend(String),
}

/// In-memory reference implementation of `PaymentStore`.
///
/// Used for tests and local-network runs. It enforces the same idempotency and
/// checkpoint semantics required of production backends.
#[derive(Debug, Default)]
pub struct InMemoryPaymentStore {
    payments: HashMap<PaymentId, CanonicalPayment>,
    checkpoint: Option<u32>,
}

impl InMemoryPaymentStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.payments.len()
    }

    pub fn is_empty(&self) -> bool {
        self.payments.is_empty()
    }
}

impl PaymentStore for InMemoryPaymentStore {
    fn upsert(&mut self, payment: &CanonicalPayment) -> Result<bool, StoreError> {
        payment.validate().map_err(StoreError::Invalid)?;
        let id = payment.id();
        if self.payments.contains_key(&id) {
            return Ok(false);
        }
        self.payments.insert(id, payment.clone());
        Ok(true)
    }

    fn checkpoint(&self) -> Option<u32> {
        self.checkpoint
    }

    fn set_checkpoint(&mut self, ledger: u32) -> Result<(), StoreError> {
        self.checkpoint = Some(ledger);
        Ok(())
    }
}

/// Operational metrics emitted by the indexer while processing payments.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct IndexerMetrics {
    pub payments_indexed: u64,
    pub payments_duplicate: u64,
    pub payments_invalid: u64,
    pub checkpoints_committed: u64,
}

/// The indexer pipeline: validates, idempotently persists, and checkpoints
/// canonical payments. Crash recovery resumes from the last committed
/// checkpoint, so replayed ledgers are safely deduplicated by `PaymentId`.
#[derive(Debug)]
pub struct Indexer<S: PaymentStore> {
    store: S,
    metrics: IndexerMetrics,
}

impl<S: PaymentStore> Indexer<S> {
    pub fn new(store: S) -> Self {
        Self {
            store,
            metrics: IndexerMetrics::default(),
        }
    }

    pub fn metrics(&self) -> &IndexerMetrics {
        &self.metrics
    }

    pub fn store(&self) -> &S {
        &self.store
    }

    /// Process a single payment. Invalid payments are counted and rejected;
    /// duplicates are counted and ignored. On success the ledger checkpoint is
    /// advanced so a crash can resume from here.
    pub fn process(&mut self, payment: &CanonicalPayment) -> Result<bool, StoreError> {
        if payment.validate().is_err() {
            self.metrics.payments_invalid += 1;
            return Err(StoreError::Invalid(payment.validate().unwrap_err()));
        }
        let inserted = self.store.upsert(payment)?;
        if inserted {
            self.metrics.payments_indexed += 1;
        } else {
            self.metrics.payments_duplicate += 1;
        }
        self.store.set_checkpoint(payment.ledger)?;
        self.metrics.checkpoints_committed += 1;
        Ok(inserted)
    }

    /// Resume point for crash recovery: the ledger to start indexing from.
    pub fn resume_ledger(&self) -> u32 {
        self.store.checkpoint().map(|l| l + 1).unwrap_or(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_payment() -> CanonicalPayment {
        CanonicalPayment {
            ledger: 42,
            tx_hash: "a".repeat(64),
            op_index: 0,
            from: format!("G{}", "A".repeat(55)),
            to: format!("G{}", "B".repeat(55)),
            asset: "native".to_string(),
            amount: 1_000,
        }
    }

    #[test]
    fn validates_success_path() {
        assert_eq!(valid_payment().validate(), Ok(()));
    }

    #[test]
    fn rejects_boundary_and_invalid_fields() {
        let mut p = valid_payment();
        p.amount = 0;
        assert_eq!(p.validate(), Err(ValidationError::NonPositiveAmount));

        let mut p = valid_payment();
        p.ledger = 0;
        assert_eq!(p.validate(), Err(ValidationError::ZeroLedger));

        let mut p = valid_payment();
        p.tx_hash = "Z".repeat(64);
        assert_eq!(p.validate(), Err(ValidationError::InvalidTxHash));

        let mut p = valid_payment();
        p.asset = "USD".to_string();
        assert_eq!(p.validate(), Err(ValidationError::InvalidAsset));
    }

    #[test]
    fn idempotent_replay_does_not_duplicate() {
        let mut indexer = Indexer::new(InMemoryPaymentStore::new());
        let p = valid_payment();
        assert_eq!(indexer.process(&p), Ok(true));
        assert_eq!(indexer.process(&p), Ok(false));
        assert_eq!(indexer.metrics().payments_indexed, 1);
        assert_eq!(indexer.metrics().payments_duplicate, 1);
        assert_eq!(indexer.store().len(), 1);
    }

    #[test]
    fn crash_recovery_resumes_from_checkpoint() {
        let mut indexer = Indexer::new(InMemoryPaymentStore::new());
        assert_eq!(indexer.resume_ledger(), 1);
        indexer.process(&valid_payment()).unwrap();
        assert_eq!(indexer.resume_ledger(), 43);
    }

    #[test]
    fn invalid_payment_is_rejected_and_counted() {
        let mut indexer = Indexer::new(InMemoryPaymentStore::new());
        let mut p = valid_payment();
        p.amount = -1;
        assert!(indexer.process(&p).is_err());
        assert_eq!(indexer.metrics().payments_invalid, 1);
        assert!(indexer.store().is_empty());
    }
}
