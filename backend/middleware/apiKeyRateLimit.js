import redis from "../config/redis.js";
import { TIER_LIMITS } from "../config/rateLimiting.js";

const WINDOW_MS = 60 * 1000;

export const apiKeyRateLimit = async (req, res, next) => {
  const apiKey = req.apiKey;

  if (!apiKey) {
    return next();
  }

  if (typeof redis.zRemRangeByScore !== "function") {
    return next();
  }

  const max = apiKey.rate_limit || TIER_LIMITS.FREE;
  const key = `ratelimit:apikey:${apiKey.id}:tier`;

  try {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    await redis.zRemRangeByScore(key, 0, windowStart);
    const count = await redis.zCard(key);

    if (count >= max) {
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(now / 1000) + Math.ceil(WINDOW_MS / 1000)));
      res.setHeader("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
      return res.status(429).json({
        error: `Rate limit exceeded. Your API key has a custom limit of ${max} requests per minute.`,
        limit: max,
        isCustomLimit: apiKey.rate_limit !== null && apiKey.rate_limit !== undefined,
      });
    }

    const memberId = `${now}-${Math.random().toString(36).slice(2)}`;
    await redis.zAdd(key, { score: now, value: memberId });

    const expireSeconds = Math.ceil(WINDOW_MS / 1000) + 60;
    if (typeof redis.expire === "function") {
      await redis.expire(key, expireSeconds);
    } else if (typeof redis.pExpire === "function") {
      await redis.pExpire(key, WINDOW_MS + 60000);
    }

    const remaining = Math.max(0, max - count - 1);
    const resetTime = Math.ceil(now / 1000) + Math.ceil(WINDOW_MS / 1000);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(resetTime));

    next();
  } catch (err) {
    console.warn("API key rate limit check failed, allowing request:", err.message);
    next();
  }
};

export default apiKeyRateLimit;
