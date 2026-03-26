# Database Setup & Connection Pool Tuning

## Quick Start

```bash
cp backend/.env.example backend/.env
# fill in DB_* values
npm install
npm start
```

## Pool Configuration

All pool settings are controlled via environment variables (see `.env.example`).

| Variable | Default | Description |
|---|---|---|
| `DB_POOL_MIN` | `2` | Minimum idle connections kept alive |
| `DB_POOL_MAX` | `10` | Maximum simultaneous connections |
| `DB_POOL_ACQUIRE_TIMEOUT` | `30000` | ms to wait for a free connection |
| `DB_POOL_IDLE_TIMEOUT` | `30000` | ms before an idle connection is released |

### Sizing Guidelines

- **DB_POOL_MAX** should not exceed the database server's `max_connections` divided by the number of app instances.  
  Formula: `DB_POOL_MAX = floor(db_max_connections * 0.8 / num_instances)`
- **DB_POOL_MIN** of `2` is suitable for most workloads; increase to `5` for consistently high-traffic services.
- Raise `DB_POOL_ACQUIRE_TIMEOUT` only if queries are legitimately slow; a low value surfaces pool exhaustion faster.

## Health Check Endpoint

```
GET /health/db
```

Response (200 healthy / 503 unhealthy):

```json
{
  "healthy": true,
  "metrics": {
    "total": 4,
    "used": 2,
    "free": 2,
    "pendingAcquires": 0,
    "pendingCreates": 0,
    "min": 2,
    "max": 10
  }
}
```

## Pool Monitoring

`startPoolMonitoring(knex, intervalMs)` logs pool metrics every 60 seconds and emits a `WARNING` when utilization reaches 80 %.  
Integrate the log output with your observability stack (CloudWatch, Datadog, etc.) by filtering on the `[pool-monitor]` prefix.

## Load Testing

```bash
# against development DB
LOAD_TEST_CONCURRENCY=30 LOAD_TEST_ITERATIONS=200 npm run load-test
```

Tune `DB_POOL_MAX` upward until `max` query latency stabilises, then stop — adding more connections beyond the DB server's capacity degrades performance.

## Running Tests

```bash
npm test
```
