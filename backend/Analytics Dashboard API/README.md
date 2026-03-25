# Analytics Module – NestJS

Provides four aggregated analytics endpoints with 5-minute Redis caching, date range filtering, and user-specific or global queries.

---

## File Structure

```
src/
├── analytics/
│   ├── dto/
│   │   └── analytics-query.dto.ts   # Shared query params (from/to/period/userId)
│   ├── interfaces/
│   │   └── analytics.interface.ts   # TypeScript response types
│   ├── analytics.controller.ts      # Route handlers
│   ├── analytics.module.ts          # Module registration
│   └── analytics.service.spec.ts   # Unit tests
├── analytics.service.ts             # Business logic + caching
├── app.module.ts                    # Wire AnalyticsModule here
└── main.ts                          # Bootstrap with Swagger
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/overview` | Full summary: stats + trends + tokens + chains |
| GET | `/api/analytics/volume` | Volume aggregated by daily/weekly/monthly |
| GET | `/api/analytics/tokens` | Top tokens by volume & count |
| GET | `/api/analytics/chains` | Top chains by count & volume |

### Common Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO 8601 date | 30 days ago | Start of date range |
| `to` | ISO 8601 date | today | End of date range |
| `period` | `daily`\|`weekly`\|`monthly` | `daily` | Aggregation granularity |
| `userId` | UUID | — | Filter to one user (omit for global) |

---

## Response Examples

### `GET /api/analytics/overview`

```json
{
  "overview": {
    "totalVolume": 1250000.50,
    "totalTransactions": 5420,
    "averageValue": 230.55,
    "successRate": 98.50,
    "completedCount": 5339,
    "pendingCount": 54,
    "failedCount": 27
  },
  "volumeByPeriod": [
    { "date": "2024-02-20", "volume": 45000.00, "count": 120 },
    { "date": "2024-02-21", "volume": 52000.00, "count": 135 }
  ],
  "topTokens": [
    { "symbol": "XLM",  "volume": 500000.00, "count": 2500 },
    { "symbol": "USDC", "volume": 400000.00, "count": 1800 }
  ],
  "topChains": [
    { "chainId": "stellar",  "chainName": "Stellar",  "count": 3000, "volume": 750000.00 },
    { "chainId": "ethereum", "chainName": "Ethereum", "count": 1500, "volume": 400000.00 }
  ]
}
```

### `GET /api/analytics/volume?period=monthly&from=2024-01-01&to=2024-12-31`

```json
[
  { "date": "2024-01", "volume": 320000.00, "count": 1100 },
  { "date": "2024-02", "volume": 280000.00, "count":  960 }
]
```

---

## Integration

### 1. Register the module

In `app.module.ts`, import `AnalyticsModule` and configure Redis/TypeORM (see `src/app.module.ts`).

### 2. Uncomment the Transaction entity

In `analytics.service.ts` and `analytics.module.ts`, uncomment the `Transaction` import and `TypeOrmModule.forFeature([Transaction])` line, then adjust the column names in the raw SQL selects to match your actual entity (`amount`, `status`, `token_symbol`, `chain_id`, `chain_name`, `user_id`).

### 3. Install dependencies

```bash
npm install @nestjs-modules/ioredis ioredis typeorm @nestjs/typeorm \
            class-validator class-transformer @nestjs/swagger swagger-ui-express
```

### 4. Environment variables

```
DATABASE_URL=postgres://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379
```

---

## Caching

All endpoints cache results in Redis for **300 seconds (5 minutes)**. Cache keys encode the endpoint name, period, date range, and userId so each unique combination is cached independently.

Cache is bypassed gracefully: if Redis is unavailable the query still executes and the result is returned without caching.

---

## Running Tests

```bash
npm test                # run all specs
npm run test:cov        # with coverage report
```

Tests cover: volume calculations, success rate arithmetic, aggregation period formatting, date range parsing, user filtering, cache hit/miss behavior.

---

## Swagger UI

Available at `http://localhost:3000/api/docs` after starting the server.
