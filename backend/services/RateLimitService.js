import redis from "../config/redis.js";
import User from "../models/User.js";
import { TIER_LIMITS } from "../config/rateLimiting.js"; // We'll update this file next

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4]) or 1

local state = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(state[1])
local lastRefill = tonumber(state[2])

if not tokens then
    tokens = capacity
    lastRefill = now
else
    local elapsed = math.max(0, now - lastRefill)
    local refill = elapsed * refillRate
    tokens = math.min(capacity, tokens + refill)
    lastRefill = now
end

local allowed = tokens >= requested
if allowed then
    tokens = tokens - requested
end

redis.call('HMSET', key, 'tokens', tostring(tokens), 'lastRefill', tostring(lastRefill))
-- Expire the key after enough time to fully refill
local expireTime = math.ceil(capacity / refillRate / 1000) + 60
redis.call('EXPIRE', key, math.max(60, expireTime))

return {tostring(allowed), tostring(math.floor(tokens))}
`;

const RateLimitService = {
  /**
   * Consume a token from the bucket
   * @param {string} key - Redis key
   * @param {number} capacity - Max tokens
   * @param {number} refillRatePerMs - Refill rate (tokens per ms)
   * @returns {Promise<{allowed: boolean, remaining: number}>}
   */
  async consume(key, capacity, refillRatePerMs) {
    try {
      const now = Date.now();
      const result = await redis.eval(TOKEN_BUCKET_LUA, {
        keys: [key],
        arguments: [
          capacity.toString(),
          refillRatePerMs.toString(),
          now.toString(),
          "1"
        ]
      });

      return {
        allowed: result[0] === "true",
        remaining: parseInt(result[1])
      };
    } catch (error) {
      console.error(`[RateLimitService] Error consuming token for ${key}:`, error);
      // Default to allowed in case of Redis failure to prevent DoS on ourselves, 
      // or false if we want strict security. We'll use false for safety in prod.
      return { allowed: false, remaining: 0, error: "Redis utility failure" };
    }
  },

  /**
   * Get limits for a user tier
   * @param {string} tier - FREE, PREMIUM, ENTERPRISE
   * @returns {Object} { capacity, refillRatePerMs }
   */
  getTierLimits(tier = "FREE", endpointType = "api") {
    // Default fallback limits
    const config = TIER_LIMITS[tier] || TIER_LIMITS.FREE;
    const limit = config[endpointType] || config.api || 100; // default 100/hr
    
    // Convert to tokens per ms
    const capacity = limit;
    const refillRatePerMs = limit / (60 * 60 * 1000); // per hour to per ms
    
    return { capacity, refillRatePerMs };
  }
};

export default RateLimitService;
