# Housekeeping Jobs (singleton scheduling)

The API process runs these periodic housekeeping jobs on a `setInterval`:

- **Audit log cleanup** (24h) — deletes `audit_logs` rows older than
  `AUDIT_LOG_RETENTION_DAYS` (default 90).
- **Export cleanup** (24h) — deletes expired generated export files
  (`ExportService.cleanupExpiredExports`).
- **Bill payment reconciliation** (5 min) — re-queries the provider for bill
  payments still `pending` after `BILL_RECONCILE_AFTER_MS` (default 5 minutes)
  and finalizes them (`BillPaymentService.reconcilePendingPayments`).

## Bill payment lifecycle and compensation

`BillPaymentService.processBillPayment` never holds a database transaction
open across the provider call:

1. **Reserve** — a short transaction locks the balance row, deducts the
   amount and inserts a `pending` `bill_payment` transaction with a unique
   `reference` (sent to the provider as its `request_id`), then commits.
2. **Call the provider** outside any transaction
   (`BILL_PROVIDER_TIMEOUT_MS`, default 30s). Errors and timeouts are treated
   as *unknown*, since the provider may still fulfil the order.
3. **Finalize** — `finalizePayment` locks the row and moves it from `pending`
   to `completed`, or to `failed` while refunding the reserved amount
   (compensation). Rows that are no longer `pending` are left untouched, so
   retries and concurrent reconciliation can never double-refund.

Payments left `pending` by a timeout, or by a crash between steps 1 and 3,
are resolved by the reconciliation job above.

## Why a lease, not a per-replica timer

Every API replica starts its own timer, so with a naive `setInterval` all
replicas run the same scan/delete at roughly the same time — duplicate work
against the database and filesystem, and audit-log noise that makes "how many
rows did cleanup actually delete" hard to answer.

`backend/services/HousekeepingService.js` wraps each job in a short-lived
Redis lease acquired via the existing `utils/distributedLock.js` (the same
`SET NX PX` + Lua-guarded release used by `LockService` for per-user
transaction locks — no new dependency was introduced). Each replica's timer
still fires independently, but only the replica that wins the lease for that
tick executes the job; the others see the lease held, skip immediately, and
retry on their next tick.

```
Replica A timer fires ──► acquire("housekeeping:audit-log-cleanup") → OK  ──► runs cleanup ──► release
Replica B timer fires ──► acquire("housekeeping:audit-log-cleanup") → held ──► skip
```

The lease TTL (`HOUSEKEEPING_LOCK_TTL_MS`, default 10 minutes) is a safety
net only: the lease is released as soon as the job finishes, and only expires
on its own if a replica crashes mid-run.

## Idempotency

The cleanup jobs are safe to run more than once. They each delete rows/files that
match a cutoff (`created_at < cutoff`, `expires_at < now`); a second run
against the same data simply finds nothing left to delete and returns `0`.
Bill payment reconciliation only finalizes rows that are still `pending`
under a row lock, so re-running it never double-completes or double-refunds.
The lease reduces redundant runs, but correctness never depends on it.

## Observing last-run status

`GET /api/health` includes a `checks.housekeepingJobs` field with the
last-known outcome for each job, on the replica that answers the request:

```json
{
  "checks": {
    "housekeepingJobs": {
      "auditLogCleanup": {
        "lastRunAt": "2026-08-29T02:00:03.120Z",
        "lastDurationMs": 42,
        "lastStatus": "success",
        "lastResult": { "deleted": 118 },
        "lastError": null
      },
      "exportCleanup": {
        "lastSkippedAt": "2026-08-29T02:00:00.041Z"
      }
    }
  }
}
```

A replica that executed the job reports `lastRunAt`/`lastDurationMs`/
`lastStatus`/`lastResult`. A replica that lost the race for the lease reports
`lastSkippedAt` instead — this is expected and not an error.

## Tests

`backend/tests/housekeepingJobs.test.js` mocks the distributed lock, audit
log model, and export service to verify:

- **Two-instance exclusion** — when two "instances" call the same job
  concurrently, only one executes the underlying work; the other returns
  `{ ran: false }` without touching the mocked model/service.
- **Idempotency** — calling a job twice in a row is safe (second run is a
  no-op) and the lease is released after a failed run so the next tick can
  still acquire it.
- **Metrics** — successful, skipped, and failed runs each produce the
  expected `getHousekeepingStatus()` snapshot.
