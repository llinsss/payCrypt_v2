# Response to maintainer review — PRs #340, #351, #400

## TL;DR

The maintainer is right. The three PRs were 30k–40k lines each. The real work
for issue #351 is **720 lines**, and even that includes 276 lines of tests.

Two things went wrong, and only one of them is "too much code":

1. **The branches were stacked on each other, not on `master`.** Each PR
   re-contained the previous PR's diff.
2. **A 30k-line generated Postman collection** was committed as source.
3. **The #351 code was written in the wrong project**, so it did not actually
   implement the issue.

---

## 1. What actually inflated the diffs

Measured against `merge-base` with `origin/master`:

| Branch | Files | Insertions |
|---|---:|---:|
| `#340-...-FIX` | 48 | 40,177 |
| `#351-...-FIX` | 61 | 40,442 |
| `#400-...-FIX` | 33 | 37,046 |

`#351` contains **four** commits — three of which belong to other issues:

```
2381fba Merge branch 'master' into #351-...
c9c6fe4 #351 Implement Real-Time Stellar Horizon Event Streaming  <- the actual issue (1,351 lines)
177d623 #340 Implement Token Swap Backend Endpoint                <- belongs to PR #340 (3,131 lines)
a3ca10e #400 Create Comprehensive API Documentation Site          <- belongs to PR #400 (37,046 lines)
```

Single biggest offender, pulled into all three PRs:

```
29,894 +   docs/api/Tagged_API.postman_collection.json
 1,899 +   docs/api/index.html
```

That one generated file is **~74% of every diff**. It is build output and
should be generated in CI or attached to a release, not committed.

**Fix:** branch each issue from `origin/master`, never from another feature
branch. Add `docs/api/*.postman_collection.json` to `.gitignore`.

---

## 2. The #351 code did not implement the issue

This is the more important problem, and it is why the PR could not be salvaged
by trimming commits.

The issue asks for streaming in **the main backend** (`backend/`), which is
**ESM JavaScript + Express + Knex + BullMQ + node-redis**.

The PR instead wrote **NestJS + TypeScript + TypeORM** files inside
`STELLAR CONTRIBUTIONS/taggedpay-stellar-backend/`, a separate standalone
sub-project. None of it is reachable from `backend/server.js`. The main app
imports nothing from it, so at runtime the feature does not exist.

It also duplicated infrastructure the main backend already has:

- `src/redis.service.ts` (217 lines) — `backend/config/redis.js` already exists
- `src/entities/transaction.entity.ts` (98 lines) — `backend/models/StellarTransaction.js` already exists
- `src/streaming-health.controller.ts` (159 lines) — `backend/controllers/healthController.js` already exists

The main backend already had everything needed: `StellarAccount`,
`StellarTag`, `StellarTransaction` models, their migrations, a configured
Redis client, `WebhookService.dispatch()`, and `@stellar/stellar-sdk`.

### Also a hard blocker

```
backend/services/SwapService.j     <- missing the "s"
```

while `backend/controllers/swapController.js` does:

```js
import SwapService from "../services/SwapService.js";
```

That is an unresolvable import — it crashes the server on boot.

---

## 3. What I did instead

Two small, single-purpose branches.

### `fix/duplicate-sentry-import` — 7 files, +10 −3

Pre-existing breakage on `master` that stops the server from starting. Found
while testing, unrelated to #351, kept separate on purpose.

- `backend/config/database.js` imported `* as Sentry` **twice** →
  `SyntaxError: Identifier 'Sentry' has already been declared`. This makes
  `database.js` unimportable, which takes down every module that touches the DB.
- Same file called `knex(knexConfig)`, passing the whole multi-environment
  config object instead of selecting one → `Required configuration option
  'client' is missing`. Restored `knexConfig[environment]`, which git history
  shows was lost in a merge.
- Six modules called `instrumentBullWorker()` without importing it →
  `ReferenceError` at import time.

Impact: on `master` the Jest suite aborts after 4 suites. With this fix it runs
**83 suites**.

### `feat/351-stellar-horizon-streaming` — 6 files, +720 −1

| File | Lines | Purpose |
|---|---:|---|
| `backend/services/StellarStreamService.js` | 388 | streams, cursors, backoff, payment handling |
| `backend/tests/stellarStream.test.js` | 276 | 12 unit tests |
| `backend/workers/stellarStream.js` | 22 | worker entrypoint + shutdown |
| `backend/controllers/healthController.js` | +18 | `getStellarStreamHealth` |
| `backend/routes/health.js` | +16 | route + swagger |
| `backend/workers.js` | +1 | register worker |

Acceptance criteria:

- **Payments appear within 5s** — SSE via `server.payments().forAccount().stream()`,
  push-based, no polling.
- **Survives restarts** — cursor persisted per account at
  `stellar:stream:cursor:<address>`, resumed on boot, defaults to `now`.
- **Handles Horizon downtime** — exponential backoff `1s → 60s` with jitter,
  attempt counter reset on first successful message.
- **Triggers webhooks** — reuses `WebhookService.dispatch(WEBHOOK_EVENTS.WALLET_CREDITED, …)`.
- **Health endpoint** — `GET /api/health/stellar-stream`, returns `200 ok` /
  `200 disabled` / `503 degraded` with per-stream detail.

Design notes:

- **Idempotency:** Redis `SET NX` on payment id (7-day TTL) guards against
  Horizon replaying events after a reconnect, with the DB unique constraint on
  `transaction_hash` as a second line of defence. The cursor advances *before*
  processing so a crash mid-handler cannot loop forever.
- **Off by default:** gated behind `STELLAR_STREAM_ENABLED=true` so CI and local
  dev without Horizon access are unaffected.
- **Reuses existing infrastructure** — no new Redis client, no new models, no
  new health controller, no new dependencies. `@stellar/stellar-sdk` was
  already in `backend/package.json`.

---

## 4. Verification

```
tests/stellarStream.test.js — 12 passed
```

Covers cursor default/resume/Redis-failure, balance credit, `create_account`
via `starting_balance`, outgoing-payment skip, non-payment skip, replay
protection, backoff growth and 60s cap, and health status.

Full suite, same env, durations stripped:

| Branch | Failing suites |
|---|---:|
| `fix/duplicate-sentry-import` | 25 |
| `feat/351-stellar-horizon-streaming` | 25 |

**Zero new failures.** The 25 are pre-existing and need Postgres/Redis, which
this sandbox has no services for. ESLint reports **0 errors** on all touched
files.

> Note: the full suite needs `JWT_SECRET` set or `config/jwt.js` calls
> `process.exit(1)` and silently truncates the run from 83 suites to 33. Worth
> fixing separately — it hides failures in CI.

---

## 5. Suggested next steps

1. Close/re-open #351 with `feat/351-stellar-horizon-streaming` (720 lines).
2. Land `fix/duplicate-sentry-import` first, ideally on its own — `master`
   currently cannot boot.
3. Rebuild #340 and #400 from `origin/master` so each contains only its own work.
4. Stop committing `docs/api/Tagged_API.postman_collection.json`; generate it in CI.
5. Fix `backend/services/SwapService.j` → `SwapService.js` in the #340 branch.
