import redis from "./redis.js";

export const RATE_LIMIT_TIERS = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
  ENTERPRISE: "ENTERPRISE",
};

export const TIER_LIMITS = {
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

export const ENDPOINT_TIER_LIMITS = TIER_LIMITS;

const fallbackStores = new Map();

const clientIp = (req) =>
  (req.ip || req.headers?.["x-forwarded-for"] || req.connection?.remoteAddress || "unknown")
    .toString()
    .replace(/[^a-zA-Z0-9.:-]/g, "_");

export const getOperationLimit = (tier = RATE_LIMIT_TIERS.FREE, operation = "api") => {
  const normalizedTier = tier || RATE_LIMIT_TIERS.FREE;
  if (!Object.values(RATE_LIMIT_TIERS).includes(normalizedTier)) {
    throw new Error(`Invalid tier: ${normalizedTier}`);
  }
  const tierConfig = TIER_LIMITS[normalizedTier] || TIER_LIMITS.FREE;
  if (!tierConfig || typeof tierConfig !== "object") {
    throw new Error(`Tier ${normalizedTier} has no per-operation config`);
  }
  const limit = tierConfig[operation] || tierConfig.api;
  if (typeof limit !== "number" || limit < 0) {
    throw new Error(`Invalid operation limit for ${normalizedTier}:${operation} — got ${typeof limit}: ${limit}`);
  }
  return limit;
};

export const validateRateLimitConfig = () => {
  const errors = [];
  for (const [tierName, tierConfig] of Object.entries(TIER_LIMITS)) {
    if (!Object.values(RATE_LIMIT_TIERS).includes(tierName)) {
      errors.push(`Unknown tier: ${tierName}`);
      continue;
    }
    if (typeof tierConfig !== "object" || tierConfig === null) {
      errors.push(`Tier ${tierName} config is not an object: ${typeof tierConfig}`);
      continue;
    }
    for (const [operation, limit] of Object.entries(tierConfig)) {
      if (typeof limit !== "number" || limit < 0) {
        errors.push(`Tier ${tierName} operation '${operation}' has invalid limit: ${typeof limit} ${limit}`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`Rate limit config validation failed:\n  ${errors.join("\n  ")}`);
  }
};

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
    const max = options.max || getOperationLimit(tier, endpointName);
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
