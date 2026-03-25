import rateLimit from "express-rate-limit";
import redis from "redis";
import RedisStore from "rate-limit-redis";

export const TIER_LIMITS = {
  FREE: parseInt(process.env.RATE_LIMIT_FREE_TIER) || 100,
  PREMIUM: parseInt(process.env.RATE_LIMIT_PREMIUM_TIER) || 1000,
};

export const RATE_LIMIT_TIERS = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
};

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  legacyMode: true,
});

redisClient.connect().catch(console.error);

/**
 * Global Rate Limiter
 * 15 requests per minute per IP
 */
export const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15,
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
});

/**
 * Account Creation Rate Limiter
 * 5 requests per hour per IP
 */
export const accountCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many accounts created from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.ip;
  },
});

/**
 * Payment Rate Limiter
 * 100 requests per hour per API key
 */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: "Too many payment requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Rate limit by API key if available, otherwise by user ID or IP
    return req.headers["x-api-key"] || req.user?.id || req.ip;
  },
});

/**
 * Balance Query Rate Limiter
 * 1000 requests per hour per API key
 */
export const balanceQueryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: "Too many balance queries, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Rate limit by API key if available, otherwise by user ID or IP
    return req.headers["x-api-key"] || req.user?.id || req.ip;
  },
});

/**
 * Authentication Rate Limiter
 * 10 failed login attempts per 15 minutes
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many failed login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed requests
  keyGenerator: (req, res) => {
    return req.body.email || req.ip;
  },
});

/**
 * Strict Rate Limiter
 * For sensitive operations - 5 requests per hour per user/API key
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many requests to this sensitive operation, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.headers["x-api-key"] || req.user?.id || req.ip;
  },
});

/**
 * In-memory sliding-window store used as a fallback when Redis is degraded.
 * Tracks per-key timestamps in a Map; enforces the same windowMs/max policy
 * as the Redis path so rate limiting is never silently disabled.
 *
 * Note: this store is local to the process — it does not survive restarts and
 * is not shared across horizontally-scaled instances. It exists solely to
 * prevent fail-open behaviour; the authoritative limiter is always Redis.
 */
class InMemoryStore {
  constructor() {
    this._buckets = new Map();
  }

  /**
   * Record a hit and check whether the caller is within limits.
   * @param {string} key       - Rate-limit key (user or IP scoped)
   * @param {number} windowMs  - Sliding window duration in ms
   * @param {number} max       - Maximum allowed hits per window
   * @returns {{ allowed: boolean, remaining: number }}
   */
  check(key, windowMs, max) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (this._buckets.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= max) {
      this._buckets.set(key, timestamps);
      return { allowed: false, remaining: 0 };
    }

    timestamps.push(now);
    this._buckets.set(key, timestamps);
    return { allowed: true, remaining: max - timestamps.length };
  }
}

/** Module-level singleton — shared across all createUserRateLimiter instances */
const inMemoryStore = new InMemoryStore();

/**
 * Per-user rate limiter using Redis sliding window algorithm.
 * Keys by user ID when authenticated, otherwise by IP.
 *
 * Fail-safe behaviour when Redis is unavailable:
 *   strict: false (default) — falls back to in-process InMemoryStore and logs
 *                             an error. Rate limiting is still enforced locally.
 *   strict: true            — returns 503 Service Unavailable immediately.
 *                             Use for sensitive routes (export, auth) where a
 *                             degraded limiter is unacceptable.
 *
 * @param {Object}  options
 * @param {number}  options.windowMs - Window size in milliseconds
 * @param {number}  options.max      - Max requests per window
 * @param {string}  options.type     - Rate limit type (key namespacing)
 * @param {string}  options.message  - Error message when limit exceeded
 * @param {boolean} options.strict   - Fail closed (503) instead of using in-memory fallback
 */
export const createUserRateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000,
    max = 100,
    type = "general",
    message = "Too many requests, please try again later",
    strict = false,
  } = options;

  /**
   * Invoked whenever Redis is unavailable (missing methods or runtime error).
   * Strict mode → 503. Non-strict → enforce limit via InMemoryStore.
   */
  function applyFallback(req, res, next, reason) {
    const key = req.user?.id
      ? `ratelimit:user:${req.user.id}:${type}`
      : `ratelimit:ip:${(req.ip || req.connection?.remoteAddress || "unknown").replace(/[^a-zA-Z0-9.]/g, "_")}:${type}`;

    console.error(
      `[rate-limit] Redis unavailable for limiter type="${type}" key="${key}" reason="${reason}".`,
      strict ? "Strict mode: returning 503." : "Falling back to in-memory store."
    );

    if (strict) {
      return res.status(503).json({ error: "Rate limiting unavailable. Please try again later." });
    }

    // Non-strict: enforce limit in-process so traffic is never unlimited
    const { allowed, remaining } = inMemoryStore.check(key, windowMs, max);
    const resetTime = Math.ceil(Date.now() / 1000) + Math.ceil(windowMs / 1000);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(resetTime));
    res.setHeader("X-RateLimit-Fallback", "in-memory");

    if (!allowed) {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message });
    }

    return next();
  }

  return async (req, res, next) => {
    const redis = (await import("./redis.js")).default;
    const key = req.user?.id
      ? `ratelimit:user:${req.user.id}:${type}`
      : `ratelimit:ip:${(req.ip || req.connection?.remoteAddress || "unknown").replace(/[^a-zA-Z0-9.]/g, "_")}:${type}`;

    // Redis client does not expose the required sorted-set commands
    if (typeof redis.zRemRangeByScore !== "function") {
      return applyFallback(req, res, next, "missing sorted-set methods");
    }

    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      await redis.zRemRangeByScore(key, 0, windowStart);
      const count = await redis.zCard(key);

      if (count >= max) {
        res.setHeader("X-RateLimit-Limit", String(max));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", String(Math.ceil(now / 1000) + Math.ceil(windowMs / 1000)));
        res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: message });
      }

      const memberId = `${now}-${Math.random().toString(36).slice(2)}`;
      await redis.zAdd(key, { score: now, value: memberId });

      const expireSeconds = Math.ceil(windowMs / 1000) + 60;
      if (typeof redis.expire === "function") {
        await redis.expire(key, expireSeconds);
      } else if (typeof redis.pExpire === "function") {
        await redis.pExpire(key, windowMs + 60000);
      }

      const remaining = Math.max(0, max - count - 1);
      const resetTime = Math.ceil(now / 1000) + Math.ceil(windowMs / 1000);

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(resetTime));

      next();
    } catch (err) {
      // Redis runtime error — apply fallback instead of silently passing traffic
      return applyFallback(req, res, next, err.message);
    }
  };
};

/**
 * Per-user rate limiter — 100 req/min (authenticated routes).
 * strict: true → 503 on Redis degradation (never silently unlimited).
 */
export const userRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  type: "user",
  strict: true,
  message: "Too many requests from this user, please try again later",
});

/**
 * Export rate limiter — 5 per hour per user.
 * strict: true → 503 on Redis degradation (bulk-data endpoint must never be unlimited).
 */
export const exportLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  type: "export",
  strict: true,
  message: "Export limit exceeded. You can export up to 5 times per hour.",
});

/**
 * Download rate limiter — 10 requests per 15 minutes per IP
 * Applied to GET /api/transactions/export/download which uses a signed
 * query-param token (email link) and must not be brute-forceable.
 */
export const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many download requests from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

export default {
  globalLimiter,
  accountCreationLimiter,
  paymentLimiter,
  balanceQueryLimiter,
  loginLimiter,
  strictLimiter,
  createUserRateLimiter,
  userRateLimiter,
  exportLimiter,
  downloadLimiter,
};
