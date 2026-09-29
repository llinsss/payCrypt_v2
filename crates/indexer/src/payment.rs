//! Canonical payment model for the Rust/Soroban indexer.
//!
//! This module defines the typed representation of a canonical payment as
//! observed on-chain, together with deterministic validation, persistence
//! semantics, idempotency handling, crash-recovery checkpoints, and the
//! operational metrics the indexer exposes.
//!
//! The model is intentionally self-contained and free of I/O so that it can be
//! unit/property tested deterministically. Persistence and indexing are
//! expressed as traits so concrete backends (Postgres, object store, ...) can
//! be plugged in without changing the canonical shape.

use std::collections::BTreeMap;
use std::fmt;

/// A 32-byte Stellar/Soroban ledger hash or transaction hash.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Hash32(pub [u8; 32]);

impl Hash32 {
    pub const ZERO: Hash32 = Hash32([0u8; 32]);

    pub fn from_slice(bytes: &[u8]) -> Result<Self, PaymentError> {
        if bytes.len() != 32 {
            return Err(PaymentError::InvalidHashLength(bytes.len()));
        }
        let mut out = [0u8; 32];
        out.copy_from_slice(bytes);
        Ok(Hash32(out))
    }
}

impl fmt::Debug for Hash32 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for b in self.0.iter() {
            write!(f, "{:02x}", b)?;
        }
        Ok(())
    }
}

/// A Soroban contract identifier (C... strkey, stored as raw bytes).
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct ContractId(pub [u8; 32]);

/// A Stellar account identifier (G... strkey, stored as raw bytes).
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct AccountId(pub [u8; 32]);

/// A signed 128-bit asset amount in the asset's smallest unit.
///
/// Amounts are always non-negative for canonical payments; the sign is kept in
/// the type so that future flows (refunds) can reuse the model without a
/// breaking change.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub struct Amount(pub i128);

/// Canonical asset identity: native XLM or a Soroban contract token.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum Asset {
    Native,
    Contract(ContractId),
}

/// The canonical, normalized payment record produced by the indexer.
///
/// Every field is derived deterministically from the source ledger entry so
/// that re-indexing the same ledger yields a byte-identical record.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct CanonicalPayment {
    /// Ledger sequence in which the payment was finalized.
    pub ledger: u32,
    /// Hash of the ledger containing the payment.
    pub ledger_hash: Hash32,
    /// Hash of the transaction that produced the payment.
    pub tx_hash: Hash32,
    /// Zero-based index of the operation within the transaction.
    pub op_index: u32,
    /// Monotonic application order within the ledger (for stable ordering).
    pub application_order: u32,
    /// Sender account.
    pub from: AccountId,
    /// Recipient account.
    pub to: AccountId,
    /// Asset transferred.
    pub asset: Asset,
    /// Amount transferred, in the asset's smallest unit.
    pub amount: Amount,
    /// Optional memo attached to the payment.
    pub memo: Option<Vec<u8>>,
}

impl CanonicalPayment {
    /// Deterministic idempotency key for this payment.
    ///
    /// The key is derived only from immutable on-chain coordinates, so the same
    /// payment always maps to the same key regardless of when it is indexed.
    pub fn idempotency_key(&self) -> PaymentKey {
        PaymentKey {
            ledger: self.ledger,
            tx_hash: self.tx_hash,
            op_index: self.op_index,
        }
    }

    /// Validate the payment against the canonical invariants.
    ///
    /// This is pure and deterministic: identical inputs always produce the
    /// same result, which makes it safe to run on replay and during recovery.
    pub fn validate(&self) -> Result<(), PaymentError> {
        if self.ledger == 0 {
            return Err(PaymentError::InvalidLedger(0));
        }
        if self.ledger_hash == Hash32::ZERO {
            return Err(PaymentError::MissingLedgerHash);
        }
        if self.tx_hash == Hash32::ZERO {
            return Err(PaymentError::MissingTxHash);
        }
        if self.amount.0 <= 0 {
            return Err(PaymentError::NonPositiveAmount(self.amount.0));
        }
        if self.from == self.to {
            return Err(PaymentError::SelfTransfer);
        }
        if let Some(memo) = &self.memo {
            if memo.len() > MAX_MEMO_BYTES {
                return Err(PaymentError::MemoTooLong(memo.len()));
            }
        }
        Ok(())
    }
}

/// Maximum accepted memo length, matching the Stellar protocol limit.
pub const MAX_MEMO_BYTES: usize = 28;

/// Stable identity of a payment used for idempotent persistence.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct PaymentKey {
    pub ledger: u32,
    pub tx_hash: Hash32,
    pub op_index: u32,
}

/// Errors surfaced by validation and persistence.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum PaymentError {
    InvalidHashLength(usize),
    InvalidLedger(u32),
    MissingLedgerHash,
    MissingTxHash,
    NonPositiveAmount(i128),
    SelfTransfer,
    MemoTooLong(usize),
    /// A payment with the same key already exists with different contents.
    ConflictingReplay(PaymentKey),
    /// The requested checkpoint is ahead of the persisted head.
    CheckpointAhead { requested: u32, head: u32 },
    /// The backing store failed.
    Storage(String),
}

impl fmt::Display for PaymentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PaymentError::InvalidHashLength(n) => write!(f, "invalid hash length: {n}"),
            PaymentError::InvalidLedger(l) => write!(f, "invalid ledger: {l}"),
            PaymentError::MissingLedgerHash => write!(f, "missing ledger hash"),
            PaymentError::MissingTxHash => write!(f, "missing transaction hash"),
            PaymentError::NonPositiveAmount(a) => write!(f, "non-positive amount: {a}"),
            PaymentError::SelfTransfer => write!(f, "self transfer"),
            PaymentError::MemoTooLong(n) => write!(f, "memo too long: {n}"),
            PaymentError::ConflictingReplay(k) => write!(f, "conflicting replay for {k:?}"),
            PaymentError::CheckpointAhead { requested, head } => {
                write!(f, "checkpoint {requested} ahead of head {head}")
            }
            PaymentError::Storage(msg) => write!(f, "storage error: {msg}"),
        }
    }
}

impl std::error::Error for PaymentError {}

/// Outcome of persisting a canonical payment.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PersistOutcome {
    /// The payment was newly inserted.
    Inserted,
    /// The payment already existed with identical contents (idempotent replay).
    AlreadyPresent,
}

/// Persistence semantics for canonical payments.
///
/// Implementations MUST be idempotent on [`PaymentKey`]: persisting the same
/// payment twice returns [`PersistOutcome::AlreadyPresent`] and never creates a
/// duplicate row. Persisting a *different* payment under an existing key MUST
/// fail with [`PaymentError::ConflictingReplay`].
///
/// Writes and the checkpoint advance MUST be atomic so that a crash between the
/// two cannot leave the indexer claiming to have processed a ledger it did not
/// fully persist.
pub trait PaymentStore {
    /// Atomically persist `payment` and advance the checkpoint to
    /// `payment.ledger` if it is greater than the current head.
    fn persist(&mut self, payment: &CanonicalPayment) -> Result<PersistOutcome, PaymentError>;

    /// Highest ledger that has been fully persisted.
    fn checkpoint(&self) -> u32;

    /// Fetch a previously persisted payment by key.
    fn get(&self, key: &PaymentKey) -> Result<Option<CanonicalPayment>, PaymentError>;
}

/// In-memory reference implementation of [`PaymentStore`].
///
/// Used by tests and as the canonical specification of the persistence
/// contract. Production backends must match this behavior exactly.
#[derive(Default)]
pub struct InMemoryPaymentStore {
    payments: BTreeMap<PaymentKey, CanonicalPayment>,
    checkpoint: u32,
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
    fn persist(&mut self, payment: &CanonicalPayment) -> Result<PersistOutcome, PaymentError> {
        payment.validate()?;
        let key = payment.idempotency_key();

        if let Some(existing) = self.payments.get(&key) {
            if existing == payment {
                return Ok(PersistOutcome::AlreadyPresent);
            }
            return Err(PaymentError::ConflictingReplay(key));
        }

        self.payments.insert(key, payment.clone());
        if payment.ledger > self.checkpoint {
            self.checkpoint = payment.ledger;
        }
        Ok(PersistOutcome::Inserted)
    }

    fn checkpoint(&self) -> u32 {
        self.checkpoint
    }

    fn get(&self, key: &PaymentKey) -> Result<Option<CanonicalPayment>, PaymentError> {
        Ok(self.payments.get(key).cloned())
    }
}

/// Crash-recovery state: the indexer resumes from the last durable checkpoint.
///
/// On restart the indexer replays from `checkpoint + 1`. Because persistence is
/// idempotent, replaying a ledger that was partially processed before the crash
/// is safe: already-persisted payments return [`PersistOutcome::AlreadyPresent`]
/// and the checkpoint is only advanced once the ledger is fully persisted.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct RecoveryPlan {
    /// First ledger to (re)process after recovery.
    pub resume_from: u32,
}

impl RecoveryPlan {
    /// Build a recovery plan from a store's durable checkpoint.
    pub fn from_store<S: PaymentStore>(store: &S) -> Self {
        RecoveryPlan {
            resume_from: store.checkpoint().saturating_add(1),
        }
    }

    /// Validate that a requested checkpoint is not ahead of the durable head.
    pub fn validate_checkpoint(&self, requested: u32) -> Result<(), PaymentError> {
        let head = self.resume_from.saturating_sub(1);
        if requested > head {
            return Err(PaymentError::CheckpointAhead { requested, head });
        }
        Ok(())
    }
}

/// Operational metrics emitted by the indexer while processing payments.
///
/// These counters are monotonic and are intended to be exported to the
/// repository's metrics backend (Prometheus/OpenTelemetry).
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct IndexerMetrics {
    /// Ledgers successfully processed.
    pub ledgers_processed: u64,
    /// Payments newly persisted.
    pub payments_inserted: u64,
    /// Idempotent replays observed (duplicate deliveries).
    pub payments_replayed: u64,
    /// Conflicting replays rejected.
    pub conflicts_rejected: u64,
    /// Validation failures.
    pub validation_failures: u64,
    /// Recovery restarts performed.
    pub recoveries: u64,
}

impl IndexerMetrics {
    /// Record the outcome of a single persist attempt.
    pub fn record(&mut self, result: &Result<PersistOutcome, PaymentError>) {
        match result {
            Ok(PersistOutcome::Inserted) => self.payments_inserted += 1,
            Ok(PersistOutcome::AlreadyPresent) => self.payments_replayed += 1,
            Err(PaymentError::ConflictingReplay(_)) => self.conflicts_rejected += 1,
            Err(_) => self.validation_failures += 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hash(byte: u8) -> Hash32 {
        Hash32([byte; 32])
    }

    fn account(byte: u8) -> AccountId {
        AccountId([byte; 32])
    }

    fn payment(ledger: u32, op_index: u32, amount: i128) -> CanonicalPayment {
        CanonicalPayment {
            ledger,
            ledger_hash: hash(1),
            tx_hash: hash(2),
            op_index,
            application_order: op_index,
            from: account(3),
            to: account(4),
            asset: Asset::Native,
            amount: Amount(amount),
            memo: None,
        }
    }

    #[test]
    fn valid_payment_passes_validation() {
        assert!(payment(10, 0, 100).validate().is_ok());
    }

    #[test]
    fn boundary_amounts_and_memo() {
        assert_eq!(
            payment(10, 0, 0).validate(),
            Err(PaymentError::NonPositiveAmount(0))
        );
        assert_eq!(
            payment(10, 0, -1).validate(),
            Err(PaymentError::NonPositiveAmount(-1))
        );

        let mut p = payment(10, 0, 1);
        p.memo = Some(vec![0u8; MAX_MEMO_BYTES]);
        assert!(p.validate().is_ok());
        p.memo = Some(vec![0u8; MAX_MEMO_BYTES + 1]);
        assert_eq!(
            p.validate(),
            Err(PaymentError::MemoTooLong(MAX_MEMO_BYTES + 1))
        );
    }

    #[test]
    fn unauthorized_self_transfer_rejected() {
        let mut p = payment(10, 0, 5);
        p.to = p.from.clone();
        assert_eq!(p.validate(), Err(PaymentError::SelfTransfer));
    }

    #[test]
    fn idempotent_replay_does_not_duplicate() {
        let mut store = InMemoryPaymentStore::new();
        let p = payment(10, 0, 100);

        assert_eq!(store.persist(&p), Ok(PersistOutcome::Inserted));
        assert_eq!(store.persist(&p), Ok(PersistOutcome::AlreadyPresent));
        assert_eq!(store.len(), 1);
        assert_eq!(store.checkpoint(), 10);
    }

    #[test]
    fn conflicting_replay_is_rejected() {
        let mut store = InMemoryPaymentStore::new();
        let p = payment(10, 0, 100);
        store.persist(&p).unwrap();

        let mut conflicting = p.clone();
        conflicting.amount = Amount(999);
        assert_eq!(
            store.persist(&conflicting),
            Err(PaymentError::ConflictingReplay(p.idempotency_key()))
        );
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn crash_recovery_resumes_from_checkpoint() {
        let mut store = InMemoryPaymentStore::new();
        store.persist(&payment(10, 0, 1)).unwrap();
        store.persist(&payment(11, 0, 1)).unwrap();

        let plan = RecoveryPlan::from_store(&store);
        assert_eq!(plan.resume_from, 12);
        assert!(plan.validate_checkpoint(11).is_ok());
        assert_eq!(
            plan.validate_checkpoint(12),
            Err(PaymentError::CheckpointAhead {
                requested: 12,
                head: 11
            })
        );

        // Replaying the last ledger is safe and idempotent.
        assert_eq!(
            store.persist(&payment(11, 0, 1)),
            Ok(PersistOutcome::AlreadyPresent)
        );
    }

    #[test]
    fn metrics_track_outcomes() {
        let mut metrics = IndexerMetrics::default();
        let mut store = InMemoryPaymentStore::new();
        let p = payment(10, 0, 100);

        metrics.record(&store.persist(&p));
        metrics.record(&store.persist(&p));

        let mut conflicting = p.clone();
        conflicting.amount = Amount(1);
        metrics.record(&store.persist(&conflicting));

        let invalid = payment(0, 0, 1);
        metrics.record(&store.persist(&invalid));

        assert_eq!(metrics.payments_inserted, 1);
        assert_eq!(metrics.payments_replayed, 1);
        assert_eq!(metrics.conflicts_rejected, 1);
        assert_eq!(metrics.validation_failures, 1);
    }

    #[test]
    fn hash_length_is_validated() {
        assert_eq!(
            Hash32::from_slice(&[0u8; 31]),
            Err(PaymentError::InvalidHashLength(31))
        );
        assert!(Hash32::from_slice(&[0u8; 32]).is_ok());
    }
}
