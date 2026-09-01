# Rate Limiting Architecture

## Overview

Rate limiting in this system is managed by a **single canonical module**: `backend/config/rateLimiting.js`. This module exports all constants, factories, and pre-built limiters used by routes and services.

## Canonical Module

**Location**: `backend/config/rateLimiting.js`

This is the **only source of truth** for rate-limiting policy. All other files that need rate limiting must import from this module.

### Why?

- **Consistency**: All routes enforce the same policy rules.
- **Maintainability**: A single place to update limits, window sizes, and behavior.
- **Testability**: Easy to verify that all exports are present and work correctly (see `rateLimitingModuleContract.test.js`).
- **Prevents accidental drift**: If a new file introduces a parallel rate-limiting module, the module-contract test catches it.

## Exported Constants

### Tier Definitions

```javascript
export const RATE_LIMIT_TIERS = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
  ENTERPRISE: "ENTERPRISE",
};
```

Defines the available subscription tiers.

### Per-Tier Limits

```javascript
export const TIER_LIMITS = {
  [TIER_LIMIT_TIERS.FREE]: 100,      // 100 requests per minute
  [TIER_LIMIT_TIERS.PREMIUM]: 1000,  // 1000 requests per minute
  [TIER_LIMIT_TIERS.ENTERPRISE]: 10000,
};
```

Default limits applied to user-level requests when no endpoint-specific limit applies.

### Per-Endpoint, Per-Tier Limits

```javascript
export const ENDPOINT_TIER_LIMITS = {
  [TIER_LIMIT_TIERS.FREE]: {
    login: 5,
    transactions: 100,
    swap: 60,
    api: 1000,
  },
  // ... PREMIUM and ENTERPRISE tiers
};
```

Endpoint-specific limits that override `TIER_LIMITS` for sensitive or resource-intensive operations.

## Exported Factories

### `createUserRateLimiter(options)`

Returns an Express middleware that rate-limits by user ID or IP address.

**Options**:
- `windowMs` (number): Time window in milliseconds (default: 60,000)
- `max` (number): Max requests per window (default: 100)
- `type` (string): Endpoint name for Redis key namespacing
- `endpointName` (string): Alias for `type`
- `strict` (boolean): Fail-closed behavior
  - `false` (default): Fall back to in-memory limiter if Redis is unavailable
  - `true`: Return 503 if Redis is unreachable
- `message` (string): Error message shown when limit exceeded

**Example**:
```javascript
const searchLimiter = createUserRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  type: "txn-search",
  strict: false,
});
```

### `createTierRateLimiter(options)`

Similar to `createUserRateLimiter`, but automatically applies per-tier limits from `ENDPOINT_TIER_LIMITS`.

**Example**:
```javascript
const apiLimiter = createTierRateLimiter({ type: "api" });
// FREE users: 1000 per minute (from ENDPOINT_TIER_LIMITS)
// PREMIUM users: 5000 per minute
```

## Pre-Built Limiters

The module exports several pre-configured limiters ready to use in routes:

### `balanceQueryLimiter`
- Max: 120 requests per 60 seconds
- Used by: `balances.js`

### `strictLimiter`
- Max: 20 requests per 15 minutes
- Strict mode enabled (fail-closed)
- Used by: `apiKeys.js`

### `paymentLimiter`
- Max: 30 requests per 60 seconds
- Used by: `batchPayments.js`, `scheduledPayments.js`

### `downloadLimiter`
- Max: 10 requests per 15 minutes
- Intended for expensive download operations

## Redis Failure Modes

When Redis is unavailable, the behavior depends on the `strict` option:

### Non-Strict (Default)

Falls back to an **in-memory limiter** with bounded memory:
- Maintains a sliding window in memory
- Window entries are automatically cleaned when they expire
- Provides degraded but functional rate limiting
- No requests are silently allowed (protection never fully disappears)

**Use case**: General API endpoints where a graceful degradation is acceptable.

### Strict Mode

Returns **HTTP 503** (Service Unavailable) on every request:
- No fallback—enforcement cannot be guaranteed without Redis
- Signals to clients that the service is in a degraded state
- Clients should retry later (Retry-After header is set)

**Use case**: Security-sensitive operations (login, account changes, payments) where allowing unlimited requests would be worse than blocking all requests.

## Module Contract Test

Location: `backend/tests/rateLimitingModuleContract.test.js`

This test verifies that:
1. All expected exports are present (constants, factories, pre-built limiters)
2. Each export has the correct type (function, object, etc.)
3. Pre-built limiters are properly configured

**Why this test?**
- Catches import failures early (before they surface as confusing integration-test errors)
- Enforces that new limiters are added to this canonical module, not elsewhere
- Runs as part of the standard `npm test` suite in CI

**When to update this test**:
- You add a new export to `rateLimiting.js` → add a check in the module-contract test
- You rename or remove an export → update the test accordingly
- You add a new pre-built limiter → verify it's tested

## Adding a New Rate Limiter

1. **Define it in `config/rateLimiting.js`**:
   ```javascript
   export const myEndpointLimiter = createUserRateLimiter({
     type: "my-endpoint",
     windowMs: 60 * 1000,
     max: 50,
     strict: false,
   });
   ```

2. **Update the module-contract test** (`rateLimitingModuleContract.test.js`):
   ```javascript
   const expectedExports = [
     // ... existing exports
     "myEndpointLimiter",
   ];
   ```

3. **Import and use in the route**:
   ```javascript
   import { myEndpointLimiter } from "../config/rateLimiting.js";
   router.get("/my-endpoint", authenticate, myEndpointLimiter, controller);
   ```

4. **Document in this file** (if it's a special or important limiter).

## Avoiding Duplicate Modules

**Problem**: If a developer creates a second rate-limiting module (e.g., `config/rateLimiting2.js`) and imports from it, the system has two sources of truth and policy drift becomes possible.

**Prevention**:
- The module-contract test will not detect the new module (it only tests imports from the canonical module).
- Code review should catch it.
- Use code-search (IDE or grep) to ensure no routes import from anything other than `config/rateLimiting.js`.

**If you find a duplicate**:
1. Verify nothing still imports from it (grep for the module name)
2. Migrate any imports to the canonical module
3. Delete the duplicate module
4. Update the module-contract test if needed

## Related Services and Middleware

These files depend on exports from the canonical module but serve different purposes:

- **`services/RateLimitService.js`**: Higher-level service for managing user tiers, API key limits, and token bucket algorithms (uses `TIER_LIMITS`, `ENDPOINT_TIER_LIMITS`, `RATE_LIMIT_TIERS`)
- **`middleware/rateLimiter.js`**: A separate factory (`rateLimit`) with Sentry/AuditLog integration (independent of the canonical module; used in app.js for global rate limiting)
- **`middleware/userRateLimit.js`**: Alternative user-level middleware (uses `TIER_LIMITS` from canonical module)
- **`middleware/apiKeyRateLimit.js`**: API key-level middleware (uses `TIER_LIMITS` from canonical module)

Routes typically use the pre-built limiters from the canonical module, not these services/middleware directly.

## Testing Rate Limiters

### Unit Tests

Test in `rateLimitingModuleContract.test.js`:
```javascript
it("should export balanceQueryLimiter as a function", async () => {
  const { balanceQueryLimiter } = await import("../config/rateLimiting.js");
  expect(typeof balanceQueryLimiter).toBe("function");
});
```

### Integration Tests

Use supertest in route tests to verify limiter behavior:
```javascript
const r1 = await request(app).get("/api/balances");
expect(r1.status).toBe(200);
expect(r1.headers["x-ratelimit-remaining"]).toBe("...");
```

### Redis Failure Tests

See `rateLimitFallback.test.js` for strict/non-strict mode verification.

## Summary

| File | Purpose | Canonical? |
|------|---------|-----------|
| `config/rateLimiting.js` | Constants, factories, pre-built limiters | ✅ YES |
| `services/RateLimitService.js` | Token bucket, tier management | No—uses canonical |
| `middleware/rateLimiter.js` | Global rate limiting factory | No—independent |
| `middleware/userRateLimit.js` | User-level middleware | No—uses canonical |
| `middleware/apiKeyRateLimit.js` | API key middleware | No—uses canonical |
| `tests/rateLimitingModuleContract.test.js` | Verifies canonical exports | Test file |

Always import rate limiters from `config/rateLimiting.js`. Never create parallel rate-limiting modules.
