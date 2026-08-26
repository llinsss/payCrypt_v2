# Batch Payment Integrity — Merkle Proof Verification

_Issue #448_

## Problem

The batch payment system processes up to 50 payments per batch. Because batches
are prepared and executed off-chain, a compromised backend or a tampered batch
job could alter a recipient or amount between the moment a batch is authorized
and the moment each payment is executed — with no way to detect it after the
fact.

## Approach

Before a batch executes, the service computes a **Merkle root** over all payment
leaves and persists it with the batch. Each payment's Merkle proof is then
**verified against that committed root immediately before the payment is
executed**. Any mismatch aborts that payment (and, for atomic batches, the whole
batch), because it means the leaf no longer matches what was committed.

### Leaf definition

Each leaf commits to the three fields that must not change between commitment
and execution:

```
leaf = keccak256(`${recipient}|${amount}|${token}`)
```

- `recipient` — resolved on-chain destination address
- `amount` — payment amount, normalized (`1` and `1.0` hash identically)
- `token` — asset code (e.g. `XLM`)

### Tree

- Hash function: `keccak256`
- Built with `merkletreejs` using `sortPairs: true`, so proofs verify
  independently of leaf ordering.
- Root is stored as a `0x`-prefixed hex string.

## Where it happens

| Step | Location |
| --- | --- |
| Compute root + per-leaf proofs | `BatchPaymentService.prepareBatch()` |
| Persist root on the batch | `payment_batches.merkle_root` (migration `20260730000000`) |
| Verify each leaf before execution | `BatchPaymentService.assertLeafIntegrity()` — called in both `processAtomicBatch()` and `processNonAtomicBatch()` |
| Utility | `utils/merkle.js` (`buildMerkleTree`, `getProof`, `verifyLeaf`, `computeMerkleRoot`) |

- **Atomic batches:** an integrity failure on any leaf throws before the
  on-chain transaction is submitted, so the entire batch is rolled back.
- **Non-atomic batches:** a failing leaf is marked failed and skipped; valid
  leaves continue.

## API

The Merkle root is returned in the batch payment response and status payloads:

```jsonc
// POST /api/batch-payments  → 201
{
  "success": true,
  "message": "Batch payment processed successfully",
  "data": {
    "id": 123,
    "reference": "BATCH-...",
    "status": "completed",
    "merkle_root": "0x9f2c...",   // persisted column
    "merkleRoot": "0x9f2c...",    // convenience alias
    "total_items": 3,
    "successful_items": 3,
    "transactions": [ /* ... */ ]
  }
}
```

```
GET /api/batch-payments/:id  → 200
{ "success": true, "data": { ..., "merkle_root": "0x9f2c..." } }
```

Clients (or auditors) can independently recompute the root from the batch's
recipient/amount/token tuples and compare it to `merkle_root` to confirm the
executed batch matches what was authorized.

## On-chain anchoring (follow-up)

Storing the root **on-chain via a contract event** (as opposed to in the
backend database and signed transaction data) requires a contract change and
redeploy on each target chain. That is tracked as a follow-up; this change
delivers the off-chain integrity layer end-to-end (compute → persist → verify →
expose), which is independently useful and required by all downstream steps.
