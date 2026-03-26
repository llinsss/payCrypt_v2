import RateLimitService from "../services/RateLimitService.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";

/**
 * IP Whitelist from environment
 */
const IP_WHITELIST = (process.env.IP_WHITELIST || "").split(",").map(ip => ip.trim()).filter(Boolean);

/**
 * Rate Limiter Middleware Factory
 * @param {Object} options
 * @param {string} options.endpointName - Name for namespacing (e.g., 'login', 'transaction')
 * @param {number} options.windowMs - Refill window in ms (e.g., 60 * 60 * 1000 for hour)
 * @param {number} options.max - Capacity (max tokens)
 * @param {string} options.keyPrefix - Prefix for Redis keys
 */
export const rateLimit = (options = {}) => {
  const {
    endpointName = "api",
    windowMs = 60 * 60 * 1000,
    max = 1000,
    keyPrefix = "ratelimit"
  } = options;

  return async (req, res, next) => {
    // 1. IP Whitelist bypass
    if (IP_WHITELIST.includes(req.ip)) {
      return next();
    }

    // 2. Identify user or IP
    const identifier = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    const redisKey = `${keyPrefix}:${endpointName}:${identifier}`;

    // 3. Determine limits based on tier
    let capacity = max;
    let refillRatePerMs = max / windowMs;

    if (req.user?.id) {
      try {
        const user = await User.findById(req.user.id);
        const tierLimits = RateLimitService.getTierLimits(user?.tier || "FREE", endpointName);
        capacity = tierLimits.capacity;
        refillRatePerMs = tierLimits.refillRatePerMs;
      } catch (err) {
        console.error("[RateLimiter] Failed to fetch user tier, using defaults:", err);
      }
    }

    // 4. Consume token
    const { allowed, remaining, error } = await RateLimitService.consume(
      redisKey,
      capacity,
      refillRatePerMs
    );

    // 5. Set Headers
    res.setHeader("X-RateLimit-Limit", Math.floor(capacity));
    res.setHeader("X-RateLimit-Remaining", remaining);
    
    // Calculate reset time (when bucket will be full)
    const resetTime = Math.ceil(Date.now() / 1000 + (capacity - remaining) / (refillRatePerMs * 1000));
    res.setHeader("X-RateLimit-Reset", resetTime);

    if (error && !allowed) {
      return res.status(503).json({ error: "Rate limiting service temporarily unavailable" });
    }

    if (!allowed) {
      // 6. Log Violation
      await AuditLog.create({
        userId: req.user?.id || null,
        action: "rate_limit_exceeded",
        resource: endpointName,
        endpoint: req.originalUrl,
        ipAddress: req.ip,
        details: { remaining, capacity, limitType: endpointName },
        statusCode: 429
      });

      const retryAfter = Math.ceil(1 / (refillRatePerMs * 1000)); // Time to get 1 token
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        error: "Too many requests",
        message: `Rate limit for ${endpointName} exceeded. Please try again later.`,
        retryAfter
      });
    }

    next();
  };
};

export default rateLimit;
