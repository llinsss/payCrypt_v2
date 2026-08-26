/**
 * ════════════════════════════════════════════════════════════════════════════════
 * CANONICAL RATE-LIMITING MODULE
 *
 * This module is the single source of rate-limit policy. All routes, services,
 * and middleware import rate limiters and constants from this module only.
 *
 * Routes that import from here:
 *   - balances.js → balanceQueryLimiter, TIER_LIMITS
 *   - apiKeys.js → strictLimiter
 *   - batchPayments.js → paymentLimiter
 *   - transactionSearch.js → createUserRateLimiter
 *   - scheduledPayments.js → paymentLimiter
 *
 * DO NOT create duplicate rate-limiting modules. If adding a new limiter or
 * constant, add it to this module and update backend/tests/rateLimitingModuleContract.test.js
 * to verify the export is tested. See RATE_LIMITING_ARCHITECTURE.md for details.
 * ════════════════════════════════════════════════════════════════════════════════
 */

import redis from "./redis.js";
import logger from "../utils/logger.js";

export const RATE_LIMIT_TIERS = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
  ENTERPRISE: "ENTERPRISE",
};

// Per-minute user limits kept for backwards-compatible tests and middleware.
export const TIER_LIMITS = {
  [RATE_LIMIT_TIERS.FREE]: 100,
  [RATE_LIMIT_TIERS.PREMIUM]: 1000,
  [RATE_LIMIT_TIERS.ENTERPRISE]: 10000,
};

export const ENDPOINT_TIER_LIMITS = {
  [RATE_LIMIT_TIERS.FREE]: {
    login: 5,
    transactions: 100,
    swap: 60,
    api: 1000,
  },
  [RATE_LIMIT_TIERS.PREMIUM]: {
    login: 20,
    transactions: 1000,
    swap: 600,
    api: 5000,
  },
  [RATE_LIMIT_TIERS.ENTERPRISE]: {
    login: 100,
    transactions: 10000,
    swap: 5000,
    api: 50000,
  },
};

const fallbackStores = new Map();

// Track Redis availability for recovery detection and metrics
const rateLimitingState = {
  redisUnavailable: false,
  lastFailureTime: null,
  recoveryTime: null,
  fallbackActivationCount: 0,
  inMemoryLimitViolations: 0,
};

const clientIp = (req) =>
  (req.ip || req.headers?.["x-forwarded-for"] || req.connection?.remoteAddress || "unknown")
    .toString()
    .replace(/[^a-zA-Z0-9.:-]/g, "_");

const hasRedisSortedSet = () =>
  redis &&
  typeof redis.zRemRangeByScore === "function" &&
  typeof redis.zCard === "function" &&
  typeof redis.zAdd === "function";

const setHeaders = (res, { limit, remaining, reset, fallback = null }) => {
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(reset));
  if (fallback) res.setHeader("X-RateLimit-Fallback", fallback);
};

const consumeInMemory = ({ key, now, windowMs, max }) => {
  const windowStart = now - windowMs;
  const entries = (fallbackStores.get(key) || []).filter((ts) => ts > windowStart);
  const allowed = entries.length < max;
  if (allowed) entries.push(now);
  fallbackStores.set(key, entries);
  return {
    allowed,
    count: entries.length,
    remaining: Math.max(0, max - entries.length),
  };
};

export const createUserRateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000,
    max = 100,
    type = "user",
    endpointName = type,
    strict = false,
    message = "Too many requests from this user, please try again later",
  } = options;

  return async (req, res, next) => {
    const now = Date.now();
    const reset = Math.ceil((now + windowMs) / 1000);
    const identifier = req.user?.id ? `user:${req.user.id}` : `ip:${clientIp(req)}`;
    const key = `ratelimit:${endpointName}:${identifier}`;

    const useFallback = async () => {
      // Emit metric when falling back to in-memory (only on first fallback per failure event)
      if (!rateLimitingState.redisUnavailable) {
        rateLimitingState.redisUnavailable = true;
        rateLimitingState.lastFailureTime = now;
        rateLimitingState.fallbackActivationCount += 1;
        logger.warn("Rate limiter falling back to in-memory due to Redis unavailability", {
          fallbackCount: rateLimitingState.fallbackActivationCount,
          endpoint: endpointName,
          mode: strict ? "strict-rejected" : "in-memory-fallback",
        });
      }
      const result = consumeInMemory({ key, now, windowMs, max });
      setHeaders(res, { limit: max, remaining: result.remaining, reset, fallback: "in-memory" });
      if (!result.allowed) {
        rateLimitingState.inMemoryLimitViolations += 1;
        res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: message, limit: max });
      }
      return next();
    };

    if (!hasRedisSortedSet()) {
      if (strict) {
        if (!rateLimitingState.redisUnavailable) {
          rateLimitingState.redisUnavailable = true;
          rateLimitingState.lastFailureTime = now;
          logger.warn("Rate limiter Redis check failed, strict mode blocking request", {
            endpoint: endpointName,
            reason: "missing_sorted_set_methods",
          });
        }
        return res.status(503).json({ error: "Rate limiter unavailable" });
      }
      return useFallback();
    }

    try {
      // Redis is available — check if we're recovering
      if (rateLimitingState.redisUnavailable) {
        rateLimitingState.redisUnavailable = false;
        rateLimitingState.recoveryTime = now;
        logger.info("Rate limiter Redis recovered, resuming normal operation", {
          downtime: now - rateLimitingState.lastFailureTime,
          fallbackActivations: rateLimitingState.fallbackActivationCount,
          inMemoryViolations: rateLimitingState.inMemoryLimitViolations,
        });
      }

      const windowStart = now - windowMs;
      await redis.zRemRangeByScore(key, 0, windowStart);
      const count = await redis.zCard(key);
      if (count >= max) {
        setHeaders(res, { limit: max, remaining: 0, reset });
        res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: message, limit: max });
      }
      await redis.zAdd(key, { score: now, value: `${now}-${Math.random().toString(36).slice(2)}` });
      if (typeof redis.expire === "function") await redis.expire(key, Math.ceil(windowMs / 1000) + 60);
      setHeaders(res, { limit: max, remaining: max - count - 1, reset });
      return next();
    } catch (error) {
      if (strict) {
        if (!rateLimitingState.redisUnavailable) {
          rateLimitingState.redisUnavailable = true;
          rateLimitingState.lastFailureTime = now;
          logger.error("Rate limiter Redis error, strict mode blocking request", {
            endpoint: endpointName,
            error: error.message,
            strict: true,
          });
        }
        return res.status(503).json({ error: "Rate limiter unavailable" });
      }
      logger.warn("Rate limiter Redis error, falling back to in-memory", {
        endpoint: endpointName,
        error: error.message,
      });
      return useFallback();
    }
  };
};

export const createTierRateLimiter = (options = {}) => {
  const endpointName = options.endpointName || options.type || "api";
  return async (req, res, next) => {
    const tier = req.user?.tier || RATE_LIMIT_TIERS.FREE;
    const endpointLimits = ENDPOINT_TIER_LIMITS[tier] || ENDPOINT_TIER_LIMITS.FREE;
    const max = options.max || endpointLimits[endpointName] || endpointLimits.api || TIER_LIMITS[tier] || TIER_LIMITS.FREE;
    return createUserRateLimiter({
      ...options,
      endpointName,
      max,
    })(req, res, next);
  };
};

export const balanceQueryLimiter = createUserRateLimiter({
  type: "balance-query",
  windowMs: 60 * 1000,
  max: 120,
});

export const strictLimiter = createUserRateLimiter({
  type: "strict",
  windowMs: 15 * 60 * 1000,
  max: 20,
  strict: true,
});

export const paymentLimiter = createUserRateLimiter({
  type: "payments",
  windowMs: 60 * 1000,
  max: 30,
});

export const downloadLimiter = createUserRateLimiter({
  type: "download",
  windowMs: 15 * 60 * 1000,
  max: 10,
});

// Export internal state for testing and observability
export const getRateLimiterState = () => ({ ...rateLimitingState });
export const resetRateLimiterState = () => {
  rateLimitingState.redisUnavailable = false;
  rateLimitingState.lastFailureTime = null;
  rateLimitingState.recoveryTime = null;
  rateLimitingState.fallbackActivationCount = 0;
  rateLimitingState.inMemoryLimitViolations = 0;
};

export default {
  RATE_LIMIT_TIERS,
  TIER_LIMITS,
  ENDPOINT_TIER_LIMITS,
  createUserRateLimiter,
  createTierRateLimiter,
  balanceQueryLimiter,
  strictLimiter,
  paymentLimiter,
  downloadLimiter,
  getRateLimiterState,
  resetRateLimiterState,
};
