# Balance Query Quick Reference

## Common Query Patterns

### Get Balance by ID
```javascript
const balance = await Balance.findById(balanceId);
// Uses: idx_balances_pkey + cache
// Cache TTL: 5 minutes
```

### Get User's Balances
```javascript
const balances = await Balance.findByUserId(userId);
// Uses: idx_balances_user_token + cache
// Cache TTL: 1 minute
```

### Get User's Balances with Pagination
```javascript
const balances = await Balance.getByUser(userId, limit, offset);
// Uses: idx_balances_user_created (optimized for sorting)
// No cache (pagination varies)
```

### Get Specific User-Token Balance
```javascript
const balance = await Balance.findByUserIdAndTokenId(userId, tokenId);
// Uses: idx_balances_user_token (composite index)
// Cache TTL: 5 minutes
```

### Get User's Total Balance
```javascript
const total = await Balance.totalBalanceByUser(userId);
// Uses: idx_balances_user_usd (optimized for SUM)
// Cache TTL: 2 minutes
```

### Update Balance
```javascript
// Credit
await Balance.credit(balanceId, amount);

// Debit
await Balance.debit(balanceId, amount);

// General update
await Balance.update(balanceId, { amount, usd_value });

// All methods automatically invalidate cache
```

## Cache Behavior

### Cache Hit (Fast)
```
Request → Redis → Return cached data (0.5-2ms)
```

### Cache Miss (Slower)
```
Request → Redis (miss) → Database → Cache result → Return (5-20ms)
```

### Cache Invalidation
Automatic on:
- `create()` - Invalidates user cache
- `update()` - Invalidates user + balance cache
- `credit()` / `debit()` - Invalidates user + balance cache
- `delete()` - Invalidates user + balance cache

## Performance Tips

### ✅ Do's

1. **Use specific queries**
   ```javascript
   // Good - uses composite index
   await Balance.findByUserIdAndTokenId(userId, tokenId);
   ```

2. **Leverage caching for repeated reads**
   ```javascript
   // First call: DB query
   // Next calls within 1 min: Cache hit
   await Balance.findByUserId(userId);
   ```

3. **Use pagination for large result sets**
   ```javascript
   await Balance.getByUser(userId, 20, 0);
   ```

### ❌ Don'ts

1. **Avoid raw queries without indexes**
   ```javascript
   // Bad - no index on auto_convert_threshold
   await db("balances").where("auto_convert_threshold", value);
   ```

2. **Don't bypass the model layer**
   ```javascript
   // Bad - no caching, no cache invalidation
   await db("balances").where({ id }).update({ amount });
   
   // Good - uses model with cache management
   await Balance.update(id, { amount });
   ```

3. **Don't fetch all balances without pagination**
   ```javascript
   // Bad - can be slow with many records
   await Balance.getAll();
   
   // Good - paginated
   await Balance.getAll(20, 0);
   ```

## Monitoring Queries

### Check Query Performance
```javascript
// Enable query logging in knexfile.js
debug: true

// Or use EXPLAIN ANALYZE
const result = await db.raw(`
  EXPLAIN ANALYZE
  SELECT * FROM balances WHERE user_id = ?
`, [userId]);
```

### Monitor Cache Hit Rate
```javascript
// Add to your monitoring
const cacheKey = `balance:user:${userId}`;
const cached = await redis.get(cacheKey);
if (cached) {
  // Cache hit
  metrics.increment('balance.cache.hit');
} else {
  // Cache miss
  metrics.increment('balance.cache.miss');
}
```

## Index Usage

| Query Method | Primary Index Used | Secondary Indexes |
|--------------|-------------------|-------------------|
| `findById()` | Primary Key | - |
| `findByUserId()` | `idx_balances_user_token` | - |
| `findByUserIdAndTokenId()` | `idx_balances_user_token` | - |
| `getByUser()` | `idx_balances_user_created` | - |
| `totalBalanceByUser()` | `idx_balances_user_usd` | - |
| `findByAddress()` | `idx_balances_address` | - |

## Troubleshooting

### Slow Queries
1. Check if indexes exist: `\d balances` in psql
2. Run benchmark: `node backend/scripts/benchmark-balance-queries.js`
3. Check query plan: `EXPLAIN ANALYZE SELECT ...`

### Cache Not Working
1. Verify Redis connection: `redis.ping()`
2. Check cache keys: `redis.keys('balance:*')`
3. Verify TTL: `redis.ttl('balance:user:123')`

### Stale Cache Data
1. Cache invalidation happens automatically on updates
2. Manual invalidation: `redis.del('balance:user:123')`
3. Flush all balance cache: `redis.keys('balance:*').then(keys => redis.del(...keys))`

## Migration Commands

```bash
# Run the index migration
npm run migrate

# Rollback if needed
npx knex migrate:rollback

# Check migration status
npx knex migrate:status
```

## Benchmark Results

Run benchmarks to verify performance:

```bash
node backend/scripts/benchmark-balance-queries.js
```

Expected results:
- Cold cache: 5-20ms per query
- Warm cache: 0.5-2ms per query
- Cache speedup: 10-40x faster
