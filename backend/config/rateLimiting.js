import redis from "./redis.js";

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
      const result = consumeInMemory({ key, now, windowMs, max });
      setHeaders(res, { limit: max, remaining: result.remaining, reset, fallback: "in-memory" });
      if (!result.allowed) {
        res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: message, limit: max });
      }
      return next();
    };

    if (!hasRedisSortedSet()) {
      if (strict) {
        return res.status(503).json({ error: "Rate limiter unavailable" });
      }
      return useFallback();
    }

    try {
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
        return res.status(503).json({ error: "Rate limiter unavailable" });
      }
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
};
