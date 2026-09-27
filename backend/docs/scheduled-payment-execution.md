# Scheduled Payment Execution (exactly-once across replicas)

The `scheduled-payment-executor` BullMQ worker (`backend/workers/scheduler.js`)
runs every 60 seconds on every worker replica. Each due scheduled payment must
still be executed only once, so execution is guarded by a database claim and a
stable idempotency key.

## Claiming due rows

`ScheduledPayment.claimDuePayments({ workerId })` runs in one transaction:

1. Select due rows — `status = 'pending' AND scheduled_at <= now`, plus
   `status = 'processing' AND claim_expires_at <= now` (expired claims) —
   with `FOR UPDATE SKIP LOCKED`. Rows being claimed by another replica are
   skipped rather than waited on or double-read.
2. Mark them `processing`, set `claimed_by` to the worker id
   (`hostname:pid:uuid`) and `claim_expires_at` to `now + CLAIM_TTL_MS`
   (5 minutes).

Only the rows returned to a worker are executed by it.

## Completing

`ScheduledPayment.completeClaim(id, workerId)` marks the payment `completed`
only while that worker still owns the claim (`status = 'processing' AND
claimed_by = workerId`). If the claim expired and another replica recovered the
row, it returns `false` and the original worker skips completion and the
success notification; the new owner handles them.

Failures go through `recordFailure`, which reschedules (or pauses) the payment
and clears the claim.

## Recovering expired claims

If a worker crashes mid-execution, its rows stay `processing` until
`claim_expires_at` passes; the next scheduler run on any replica reclaims them.

## Idempotency key

Each execution passes `idempotencyKey = scheduled-payment:<id>:<scheduled_at ms>`
to `PaymentService.processPayment`. The key is stable for a given occurrence, so
a recovered claim replays the original transaction instead of paying twice. A
retry after failure or a resume changes `scheduled_at`, which produces a new key.

## Schema

Migration `20260924000000_add_claim_columns_to_scheduled_payments.js` adds
`claimed_by`, `claim_expires_at` and an index on `(status, claim_expires_at)`.
Rollback drops them.

## Tests

- `tests/scheduledPaymentClaim.test.js` — runs two competing schedulers against
  PostgreSQL (isolated schema) and checks every due payment is claimed exactly
  once, expired-claim recovery, claim-guarded completion and key stability.
  Skipped when no database is reachable (set `DB_HOST`, `DB_PORT`, `DB_NAME`,
  `DB_USER`, `DB_PASSWORD` to run it locally).
- `tests/scheduledPaymentWorker.test.js` — worker uses the claim, the stable
  key and claim-guarded completion.
