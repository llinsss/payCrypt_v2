# Exchange-Rate Freshness Contract

Issue #584. `services/exchange-rate-api.js` caches fiat rates from
exchangerate-api.com. Previously any provider or cache failure silently
returned hard-coded fallback rates, so a conversion could transact on obsolete
data without anyone knowing. This document describes the freshness contract
that replaced that behaviour.

## Cache record

Rates are cached in Redis under `exchange_rates:fiat` as:

```json
{ "rates": { "USD": 1, "EUR": 0.92, "GBP": 0.79, "NGN": 1600 },
  "fetched_at": "2026-08-28T09:00:00.000Z",
  "source": "exchangerate-api" }
```

Legacy bare-map cache entries are still read; they are treated as having no
timestamp and therefore trigger a refresh.

## Thresholds

| Env var                          | Default | Meaning |
|----------------------------------|---------|---------|
| `EXCHANGE_RATE_STALE_SECONDS`    | `3600`  | Age past which a cache entry is "stale" and a refresh is attempted |
| `EXCHANGE_RATE_MAX_STALE_SECONDS`| `21600` | Age past which data is "expired" and must not back a conversion |
| `EXCHANGE_RATE_ALLOW_DEGRADED`   | `false` | If `true`, expired/missing data degrades to bundled fallback rates instead of throwing |

Freshness classification: `fresh` (age &lt; stale), `stale`
(stale ≤ age &lt; max), `expired` (age ≥ max).

## Behaviour

`getRatesDetailed()` returns `{ rates, fetchedAt, source, ageSeconds,
freshness, degraded }` and resolves as follows:

| Cache state | Provider | Result |
|-------------|----------|--------|
| Fresh | *(not called)* | `fresh`, `degraded: false` |
| Stale / expired / missing | success | fresh data, cache updated |
| Stale (within max) | fails | cached rates, `freshness: "stale"`, `degraded: true` |
| Expired / missing | fails, `ALLOW_DEGRADED=false` | throws `StaleExchangeRateError` (`code: "EXCHANGE_RATE_STALE"`) |
| Expired / missing | fails, `ALLOW_DEGRADED=true`  | bundled fallback rates, `source: "fallback"`, `degraded: true` |

`getRates()` / `convertFromUSD()` / `convertToUSD()` are unchanged in shape but
now **propagate `StaleExchangeRateError`** instead of silently returning
fallback numbers. Callers already wrap these in `try/catch` (`next(err)`), so a
prolonged provider outage surfaces as an explicit error response rather than a
wrong amount.

## Exposing freshness

- `GET /api/exchange-rates` sets `X-Exchange-Rate-Freshness` and
  `X-Exchange-Rate-Fetched-At` response headers (body shape unchanged).
- `GET /api/exchange-rates/freshness` returns the freshness metadata without
  triggering a provider fetch:

  ```json
  { "available": true, "fetchedAt": "2026-08-28T09:00:00.000Z",
    "source": "exchangerate-api", "ageSeconds": 7200, "freshness": "stale",
    "staleAfterSeconds": 3600, "maxStaleSeconds": 21600 }
  ```
