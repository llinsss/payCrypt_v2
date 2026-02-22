# Balance Query Optimization Guide

## Overview

This document describes the performance optimizations implemented for balance queries, including database indexing, query optimization, and caching strategies.

## Optimizations Implemented

### 1. Database Indexes (Migration 012)

Added composite and single-column indexes to optimize common query patterns:

```javascript
// Composite index for user_id + token_id lookups (most common)
idx_balances_user_token (user_id, token_id)

// Index for token_id JOIN operations
idx_balances_token_id (token_id)

// Index for address lookups
idx_balances_address (address)

// Composite index for user queries with sorting
idx_balances_user_created (user_id, created_at)

// Composite index for aggregation queries
idx_balances_user_usd (user_id, usd_value)
```

### 2. Query Optimizations

#### Explicit Column Selection
Changed from `SELECT balances.*` to explicit column selection to reduce data transfer:

```javascript
// Before
.select("balances.*", "users.email", ...)

// After
.select(
  "balances.id",
  "balances.user_id",
  "balances.token_id",
  // ... explicit columns
)
```

#### Index-Aware Queries
Queries now leverage composite indexes for better performance:

- `findByUserIdAndTokenId`: Uses `idx_balances_user_token`
- `getByUser`: Uses `idx_balances_user_created` for sorted results
- `totalBalanceByUser`: Uses `idx_balances_user_usd` for aggregations

### 3. Redis Caching Layer

Implemented multi-level caching with automatic invalidation:

#### Cache Keys
```javascript
balance:id:{id}                    // Individual balance
balance:user:{userId}              // User's all balances
balance:user:{userId}:token:{tokenId}  // Specific user-token balance
balance:total                      // Total system balance
balance:total:user:{userId}        // User's total balance
```

#### Cache TTLs
- `BALANCE_BY_ID`: 5 minutes
- `BALANCE_BY_USER`: 1 minute
- `BALANCE_BY_USER_TOKEN`: 5 minutes
- `TOTAL_BALANCE`: 2 minutes

#### Cache Invalidation
Automatic cache invalidation on:
- Balance creation
- Balance updates (credit/debit)
- Balance deletion

### 4. Performance Improvements

Expected improvements based on query patterns:

| Query Type | Cold Cache | Warm Cache | Improvement |
|------------|-----------|------------|-------------|
| findById | ~5-10ms | ~0.5-1ms | 90-95% |
| findByUserId | ~10-20ms | ~1-2ms | 85-90% |
| findByUserIdAndTokenId | ~3-5ms | ~0.5ms | 85-90% |
| totalBalanceByUser | ~5-10ms | ~0.5ms | 90-95% |

## Running the Migration

```bash
# Run the migration
npm run migrate

# Or using knex directly
npx knex migrate:latest
```

## Benchmarking

Run the benchmark script to measure actual performance:

```bash
node backend/scripts/benchmark-balance-queries.js
```

The benchmark will:
1. Test query performance with cold and warm cache
2. Compare cache hit vs miss performance
3. Analyze query execution plans
4. Verify index usage

## Best Practices

### 1. Cache Warming
For high-traffic endpoints, consider warming the cache:

```javascript
// Warm cache for frequently accessed users
await Balance.findByUserId(userId);
```

### 2. Batch Operations
For bulk updates, invalidate cache once after all operations:

```javascript
// Disable cache during bulk operations
const balances = await db("balances").where("user_id", userId);
// ... perform updates
await invalidateUserCache(userId);
```

### 3. Monitoring
Monitor cache hit rates:

```javascript
// Add to your monitoring
const cacheHitRate = hits / (hits + misses);
```

## Query Patterns

### Optimized Patterns

✅ **Good**: Use indexed columns in WHERE clauses
```javascript
Balance.findByUserIdAndTokenId(userId, tokenId)
```

✅ **Good**: Use composite indexes for sorting
```javascript
Balance.getByUser(userId, limit, offset)
```

✅ **Good**: Leverage caching for repeated queries
```javascript
// First call: DB query
const balances = await Balance.findByUserId(userId);
// Subsequent calls within TTL: Cache hit
```

### Anti-Patterns

❌ **Avoid**: Selecting all columns when not needed
```javascript
// Bad
db("balances").select("*")

// Good
db("balances").select("id", "amount", "user_id")
```

❌ **Avoid**: Queries without indexed columns
```javascript
// Bad
db("balances").where("auto_convert_threshold", value)

// Good - add index first or use indexed column
db("balances").where("user_id", userId)
```

## Troubleshooting

### Cache Issues

If cache is not working:
1. Check Redis connection: `redis.ping()`
2. Verify cache keys are being set
3. Check TTL values are appropriate

### Index Issues

Verify indexes are being used:
```sql
EXPLAIN ANALYZE
SELECT * FROM balances WHERE user_id = 1 AND token_id = 2;
```

Look for "Index Scan" in the query plan.

### Performance Degradation

If queries are slow:
1. Run the benchmark script
2. Check query execution plans
3. Verify indexes exist: `\d balances` in psql
4. Monitor cache hit rates
5. Check for table bloat: `VACUUM ANALYZE balances;`

## Rollback

To rollback the index migration:

```bash
npx knex migrate:rollback
```

Note: This will remove all indexes added in migration 012.

## Future Optimizations

Potential future improvements:
1. Implement read replicas for heavy read workloads
2. Add materialized views for complex aggregations
3. Implement query result pagination with cursor-based pagination
4. Add database connection pooling optimization
5. Consider partitioning for very large balance tables

## References

- [PostgreSQL Index Documentation](https://www.postgresql.org/docs/current/indexes.html)
- [Knex.js Query Builder](https://knexjs.org/)
- [Redis Caching Strategies](https://redis.io/docs/manual/patterns/)
