import rateLimit from "express-rate-limit";
import redis from "redis";
import RedisStore from "rate-limit-redis";

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
 * Per-user rate limiter using Redis sliding window algorithm
 * Keys by user ID when authenticated, otherwise by IP
 * @param {Object} options
 * @param {number} options.windowMs - Window size in milliseconds
 * @param {number} options.max - Max requests per window
 * @param {string} options.type - Rate limit type (for key namespacing)
 * @param {string} options.message - Error message when limit exceeded
 * @returns {Function} Express middleware
 */
export const createUserRateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000,
    max = 100,
    type = "general",
    message = "Too many requests, please try again later",
  } = options;

  return async (req, res, next) => {
    const redis = (await import("./redis.js")).default;
    const key = req.user?.id
      ? `ratelimit:user:${req.user.id}:${type}`
      : `ratelimit:ip:${(req.ip || req.connection?.remoteAddress || "unknown").replace(/[^a-zA-Z0-9.]/g, "_")}:${type}`;

    if (typeof redis.zRemRangeByScore !== "function") {
      return next();
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
      console.warn("Rate limit check failed, allowing request:", err.message);
      next();
    }
  };
};

/**
 * Per-user rate limiter - 100 req/min (authenticated routes)
 */
export const userRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  type: "user",
  message: "Too many requests from this user, please try again later",
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
};
