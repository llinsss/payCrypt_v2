# Rust Indexer Canonical Payment Model

This document defines the canonical payment model for the Rust/Soroban indexer.
It specifies the typed representation, deterministic validation, persistence,
idempotency, crash recovery, indexing, operational metrics, and rollback
behavior for canonical payments observed on the Soroban network.

## 1. Scope

The indexer ingests Soroban contract events and ledger metadata and derives a
single canonical payment record per logical payment. The canonical model is the
source of truth consumed by downstream services (balances, reporting, APIs).

Out of scope: token-specific business rules beyond the canonical fields below,
and any non-payment event types.

## 2. Canonical Payment Type

```rust
/// Stable identifier for a canonical payment.
/// Derived deterministically from the source event so replays map to the same id.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct PaymentId(pub [u8; 32]);

/// A canonical payment as persisted by the indexer.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct CanonicalPayment {
    /// Deterministic id: hash(ledger_sequence, tx_hash, op_index, event_index).
    pub id: PaymentId,
    /// Ledger sequence in which the payment was finalized.
    pub ledger_sequence: u32,
    /// Transaction hash that produced the payment.
    pub tx_hash: [u8; 32],
    /// Operation index within the transaction.
    pub op_index: u32,
    /// Event index within the operation.
    pub event_index: u32,
    /// Canonical asset identifier (contract id or native marker).
    pub asset: AssetId,
    /// Sender account/contract address (canonical, checksummed form).
    pub from: Address,
    /// Recipient account/contract address (canonical, checksummed form).
    pub to: Address,
    /// Amount in the asset's smallest indivisible unit (i128, non-negative).
    pub amount: i128,
    /// Ledger close time (Unix seconds) for ordering and reporting.
    pub closed_at: u64,
}
```

`AssetId` and `Address` are the existing canonical types used elsewhere in the
indexer; this model reuses them rather than introducing parallel types.

## 3. Deterministic Validation

Validation is pure and total: given the same input it always yields the same
result, and it never panics on malformed input.

```rust
#[derive(Debug, PartialEq, Eq)]
pub enum ValidationError {
    NonPositiveAmount,
    AmountOverflow,
    EmptyAddress,
    InvalidAsset,
    LedgerSequenceZero,
}

pub fn validate(p: &CanonicalPayment) -> Result<(), ValidationError> {
    if p.ledger_sequence == 0 {
        return Err(ValidationError::LedgerSequenceZero);
    }
    if p.amount <= 0 {
        return Err(ValidationError::NonPositiveAmount);
    }
    if p.from.is_empty() || p.to.is_empty() {
        return Err(ValidationError::EmptyAddress);
    }
    if !p.asset.is_valid() {
        return Err(ValidationError::InvalidAsset);
    }
    Ok(())
}
```

Rules:

- `amount` must be strictly positive and fit in `i128`; overflow is rejected.
- `from` and `to` must be non-empty canonical addresses.
- `asset` must be a known/valid asset id.
- `ledger_sequence` must be non-zero.
- Validation is applied before persistence; invalid records are quarantined and
  never written to the canonical store.

## 4. Persistence Semantics

The canonical store is append-only and keyed by `PaymentId`.

- **Primary key:** `id` (deterministic).
- **Ordering:** `(ledger_sequence, tx_hash, op_index, event_index)`.
- **Write mode:** idempotent upsert. A write with an existing `id` is a no-op if
  the payload is byte-identical, and a conflict error otherwise (see §5).
- **Atomicity:** a batch of payments for a ledger is committed in a single
  transaction together with the ledger checkpoint (§6).
- **Immutability:** committed payments are never mutated; corrections are
  expressed as new records with a superseding reference (out of scope here).

## 5. Idempotency

Duplicate processing is prevented at two levels:

1. **Deterministic id.** `PaymentId = H(ledger_sequence || tx_hash || op_index ||
   event_index)`. Re-ingesting the same event yields the same id, so replays
   collapse to a single row.
2. **Idempotent upsert.** On write:
   - id absent → insert.
   - id present, payload identical → no-op (counted as `duplicate_noop`).
   - id present, payload differs → conflict; record is rejected and counted as
     `duplicate_conflict`, and an alert is emitted.

This guarantees at-least-once ingestion produces exactly-once canonical state.

## 6. Crash Recovery

The indexer persists a **checkpoint** after each committed ledger:

```rust
pub struct Checkpoint {
    /// Last fully committed ledger sequence.
    pub last_ledger: u32,
    /// Hash of the last committed ledger for chain-consistency checks.
    pub ledger_hash: [u8; 32],
}
```

Recovery procedure on startup:

1. Load the latest checkpoint.
2. Resume ingestion from `last_ledger + 1`.
3. Re-verify `ledger_hash` against the network; on mismatch, halt and require
   operator intervention (do not silently rewind).
4. Because writes are idempotent (§5), re-processing a partially committed
   ledger is safe and converges to the same canonical state.

Checkpoints are written in the same transaction as the ledger's payments, so a
crash never leaves payments committed without a matching checkpoint.

## 7. Indexing

Indexes maintained for query and downstream consumption:

- `by_id` — primary lookup.
- `by_ledger` — range scans for backfill and reconciliation.
- `by_from`, `by_to` — address history.
- `by_asset` — per-asset aggregation.

Index updates occur in the same transaction as the payment write to keep the
canonical store and indexes consistent.

## 8. Operational Metrics

Emitted per ingestion cycle:

- `indexer_ledgers_processed_total`
- `indexer_payments_indexed_total`
- `indexer_duplicate_noop_total`
- `indexer_duplicate_conflict_total`
- `indexer_validation_failures_total{reason}`
- `indexer_checkpoint_ledger` (gauge)
- `indexer_ingest_lag_ledgers` (gauge)
- `indexer_recovery_events_total`

Alerts:

- `duplicate_conflict_total` increasing → data integrity issue.
- `ingest_lag_ledgers` above threshold → ingestion stalled.
- `recovery_events_total` spikes → repeated crashes.

## 9. Testing

- **Unit:** validation success, boundary (zero/negative/overflow amount, empty
  address, invalid asset, zero ledger).
- **Property:** id determinism (same inputs → same id), idempotent upsert
  (replay → no-op), validation totality (no panics on arbitrary input).
- **Local-network:** ingest a real ledger, assert canonical payments and
  checkpoint; replay the same ledger and assert no duplicates.
- **Failure paths:** crash mid-ledger, restart, assert resume from checkpoint and
  convergence; conflicting payload for an existing id is rejected.

## 10. Migration, Monitoring, Rollback

**Migration.** Backfill historical ledgers through the same ingestion path so
all records pass deterministic validation and idempotent upsert. Backfill is
resumable via checkpoints and safe to re-run.

**Monitoring.** Track the metrics in §8; reconcile `payments_indexed_total`
against ledger event counts and alert on divergence.

**Rollback.** The canonical store is append-only; rollback is performed by
rewinding the checkpoint to a prior `last_ledger` and re-ingesting forward.
Because writes are idempotent, re-ingestion is safe. A rollback must be an
explicit operator action and is recorded as a `recovery_event`.
