# Token Price & NGN Rate Refresh

The API process refreshes token prices (`tokens.price`) and the cached USD→NGN
rate (`USD_NGN` in Redis) in the background. Both jobs are defined in
`backend/config/initials.js` with `createRefreshJob` and started from
`server.js` once the HTTP server is listening.

| Job | Task | Interval |
| --- | --- | --- |
| `tokenPriceRefresh` | `updateTokenPrices` | 5 minutes (`TOKEN_PRICE_REFRESH_MS`) |
| `ngnRateRefresh` | `updateNgnRate` | 1 hour (`NGN_RATE_REFRESH_MS`) |

## No overlapping runs

The jobs are self-scheduling rather than `setInterval`-driven: the next run is
scheduled `intervalMs` after the previous one settles, so a slow upstream call
delays the next refresh instead of stacking a second one on top of it.

A `run()` requested while another run is in flight (for example
`GET /api/rates/ngn` on a cache miss) does not start a duplicate: it is counted
as skipped and resolves with the in-flight run.

## Stale results are rejected

Each run holds a lease that expires after `leaseMs` (defaults to the interval).
If a run outlives its lease it is abandoned so the schedule can continue, and
any write it attempts afterwards is discarded: the tasks call `isCurrent()`
before each database/Redis write and skip it once the lease has moved on.

## Instrumentation

Every run logs its outcome (`done`, `failed` or `expired`) and duration.
Skipped runs and lease expiries are logged as warnings. Counters are available
from `job.stats()`:

```js
{ runs, skipped, timedOut, staleRejected, lastDurationMs, running }
```

## Lifecycle

`start()` is idempotent, timers are `unref`'d, and `stop()` (called during
graceful shutdown) cancels the pending run.

Tests: `backend/tests/tokenPriceRefresh.test.js`.
