# Caching Strategy

## Architecture

```
Client
  │
  ▼
NestJS API
  │
  ├─► CacheMiddleware (HTTP layer – optional response cache)
  │         │
  │         ▼
  │    Redis (ioredis)
  │         │ miss
  │         ▼
  └─► BalanceService
            │
            ├─► CacheService.get()   ◄──── Redis
            │         │ miss
            │         ▼
            └─► PostgreSQL (TypeORM)
                      │
                      └─► CacheService.set()  ──► Redis
```

### Flow

1. `GET /balances/:userId/:chainId` hits **BalanceService.getBalance()**.
2. `CacheService.get()` checks Redis with key `balance:<userId>:<chainId>`.
3. **Cache HIT** → return immediately (~5–10 ms).
4. **Cache MISS** → query PostgreSQL, write result to Redis, return (~150–200 ms).
5. Any mutation (deposit / withdraw / transfer) calls `CacheService.invalidate()` with
   a glob pattern to bust all affected keys before returning.

---

## Key Design

| Entity   | Key pattern                  | Example                  |
|----------|------------------------------|--------------------------|
| Balance  | `balance:<userId>:<chainId>` | `balance:u_abc:1`        |
| All chains for user | `balance:<userId>:*` | `balance:u_abc:*`  |

Keys use `SCAN` (not `KEYS`) for pattern-based invalidation to avoid blocking Redis.

---

## TTL

| Variable              | Default | Description                              |
|-----------------------|---------|------------------------------------------|
| `BALANCE_CACHE_TTL`   | `60`    | Seconds a balance is cached              |
| `CACHE_WARMING_LIMIT` | `1000`  | Users pre-warmed on startup / cron       |

---

## Invalidation Triggers

| Event      | Keys invalidated                          |
|------------|-------------------------------------------|
| Deposit    | `balance:<userId>:<chainId>`              |
| Withdrawal | `balance:<userId>:<chainId>`              |
| Transfer   | `balance:<fromUserId>:<chainId>` **and**  |
|            | `balance:<toUserId>:<chainId>`            |

---

## Cache Warming

`BalanceService.warmTopUsersCache(limit)` fetches the top `N` most-recently-active
users from PostgreSQL and populates Redis in a single pipelined batch write.

Run on application startup and/or via a scheduled cron job:

```typescript
// cache-warming.task.ts
@Injectable()
export class CacheWarmingTask {
  constructor(private readonly balanceService: BalanceService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async run() {
    await this.balanceService.warmTopUsersCache(1000);
  }
}
```

---

## Prometheus Metrics

| Metric name            | Labels         | Description                    |
|------------------------|----------------|--------------------------------|
| `cache_hits_total`     | `cache=balance` | Incremented on every cache hit |
| `cache_misses_total`   | `cache=balance` | Incremented on every miss      |

Derived hit rate:

```
rate(cache_hits_total{cache="balance"}[5m])
  /
(rate(cache_hits_total{cache="balance"}[5m]) + rate(cache_misses_total{cache="balance"}[5m]))
```

---

## Redis Health Check

`CacheService.healthCheck()` issues a `PING` and returns:

```json
{ "status": "ok", "latencyMs": 1 }
// or
{ "status": "error", "error": "connect ECONNREFUSED" }
```

Wire it into your health-check controller / `/health` endpoint.

---

## Graceful Degradation

If Redis is unreachable `CacheService` sets `isRedisAvailable = false` after 3
failed retries. All cache operations become no-ops and every request falls through
to PostgreSQL transparently. Once Redis reconnects the flag is reset to `true`.

---

## Performance Benchmarks

| Scenario            | p50    | p95    |
|---------------------|--------|--------|
| Cache HIT           | ~5 ms  | ~10 ms |
| Cache MISS (cold)   | ~150ms | ~200ms |
| DB-only (no cache)  | ~180ms | ~250ms |

Expected improvement after warm-up: **>95% of requests served from cache** once
the top-1000 warming job has run, reducing median latency by ~97%.
