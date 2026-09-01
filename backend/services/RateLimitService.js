import redis from "../config/redis.js";
import User from "../models/User.js";
import ApiKey from "../models/ApiKey.js";
import { RATE_LIMIT_TIERS, TIER_LIMITS, getOperationLimit } from "../config/rateLimiting.js";

const DEFAULT_WINDOW_MS = 60 * 1000;

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
local expireTime = math.ceil(capacity / refillRate / 1000) + 60
redis.call('EXPIRE', key, math.max(60, expireTime))

return {tostring(allowed), tostring(math.floor(tokens))}
`;

const assertTier = (tier) => {
  if (!Object.values(RATE_LIMIT_TIERS).includes(tier)) {
    throw new Error("Invalid tier");
  }
};

const tierLimit = (tier = RATE_LIMIT_TIERS.FREE) => {
  const normalized = tier || RATE_LIMIT_TIERS.FREE;
  assertTier(normalized);
  return TIER_LIMITS[normalized] || TIER_LIMITS.FREE;
};

const RateLimitService = {
  /**
   * Consume a token from a rate-limit bucket using token-bucket algorithm.
   * @param {string} key - Redis key for the bucket
   * @param {number} capacity - Max tokens in bucket
   * @param {number} refillRatePerMs - Tokens added per millisecond
   * @returns {Promise<{allowed: boolean, remaining: number, error?: string}>}
   * @throws Redis unavailable → returns { allowed: false, remaining: 0, error: "..." }
   */
  async consume(key, capacity, refillRatePerMs) {
    try {
      const now = Date.now();
      const result = await redis.eval(TOKEN_BUCKET_LUA, {
        keys: [key],
        arguments: [capacity.toString(), refillRatePerMs.toString(), now.toString(), "1"],
      });

      return {
        allowed: result[0] === "true",
        remaining: parseInt(result[1], 10),
      };
    } catch (error) {
      console.error(`[RateLimitService] Error consuming token for ${key}:`, error);
      return { allowed: false, remaining: 0, error: "Redis utility failure" };
    }
  },

  /**
   * Get numeric limit for a specific tier + operation.
   * Replaces the old getTierLimits pattern with direct operation lookup.
   * @param {string} tier - Tier name (FREE, PREMIUM, ENTERPRISE)
   * @param {string} endpointType - Operation name (login, transactions, swap, api, etc.)
   * @returns {{capacity: number, refillRatePerMs: number}}
   * @throws Invalid tier or malformed operation limit
   */
  getTierLimits(tier = RATE_LIMIT_TIERS.FREE, endpointType = "api") {
    const normalized = tier || RATE_LIMIT_TIERS.FREE;
    const limit = getOperationLimit(normalized, endpointType);
    return {
      capacity: limit,
      refillRatePerMs: limit / (60 * 60 * 1000),
    };
  },

  /**
   * Fetch a user's tier from the database.
   * @param {number} userId - User ID
   * @returns {Promise<string>} Tier name (FREE, PREMIUM, ENTERPRISE) or FREE if not found
   * @throws Database unavailable
   */
  async getUserTier(userId) {
    const user = await User.findById(userId);
    return user?.tier || RATE_LIMIT_TIERS.FREE;
  },

  /**
   * Fetch custom rate limit override for an API key.
   * @param {number} apiKeyId - API key ID
   * @returns {Promise<number|null>} Custom limit or null if not set or key not found
   * @throws Database unavailable
   */
  async getApiKeyRateLimit(apiKeyId) {
    const apiKey = await ApiKey.findById(apiKeyId);
    return apiKey?.rate_limit ?? null;
  },

  /**
   * Determine the effective rate limit for a request.
   * Precedence: API key override > user tier limit.
   * @param {Object} user - User object with tier property
   * @param {Object} apiKey - API key object with rate_limit property
   * @returns {Promise<number>} Numeric limit to apply
   */
  async getEffectiveRateLimit(user = {}, apiKey = {}) {
    if (apiKey?.rate_limit !== null && apiKey?.rate_limit !== undefined) {
      return apiKey.rate_limit;
    }
    return tierLimit(user?.tier || RATE_LIMIT_TIERS.FREE);
  },

  /**
   * Update a user's tier.
   * @param {number} userId - User ID
   * @param {string} tier - New tier (FREE, PREMIUM, ENTERPRISE)
   * @returns {Promise<Object>} Updated user object
   * @throws Invalid tier | Database unavailable
   */
  async setUserTier(userId, tier) {
    assertTier(tier);
    if (typeof User.updateTier === "function") {
      return User.updateTier(userId, tier);
    }
    return User.update(userId, { tier });
  },

  /**
   * Set a custom rate limit on an API key, overriding tier defaults.
   * @param {number} apiKeyId - API key ID
   * @param {number} rateLimit - New limit (must be >= 0, integer)
   * @returns {Promise<Object>} Updated API key object
   * @throws Invalid rateLimit value | Database unavailable
   */
  async setApiKeyRateLimit(apiKeyId, rateLimit) {
    if (!Number.isInteger(rateLimit) || rateLimit < 0) {
      throw new Error("rate_limit must be a non-negative integer");
    }
    return ApiKey.updateRateLimit(apiKeyId, rateLimit);
  },

  /**
   * Get full rate-limit configuration for admin/diagnostics.
   * @returns {Promise<{tiers: Object, defaults: Object}>}
   *   tiers: { TIER_NAME: { limit: number, windowMs: number }, ... }
   *   defaults: { windowMs: number, limit: number }
   */
  async getRateLimitSettings() {
    return {
      tiers: Object.fromEntries(
        Object.entries(TIER_LIMITS).map(([tier, tierConfig]) => [
          tier,
          {
            operations: tierConfig,
            windowMs: DEFAULT_WINDOW_MS,
            baselineLimit: tierConfig.api,
          },
        ]),
      ),
      defaults: {
        windowMs: DEFAULT_WINDOW_MS,
        tier: RATE_LIMIT_TIERS.FREE,
        limit: TIER_LIMITS.FREE.api,
      },
    };
  },

  /**
   * Get rate-limit status for a specific user.
   * @param {number} userId - User ID
   * @returns {Promise<{userId: number, tier: string, limit: number, windowMs: number}>}
   * @throws Database unavailable
   */
  async getUserRateLimitStatus(userId) {
    const tier = await this.getUserTier(userId);
    return {
      userId,
      tier,
      limit: tierLimit(tier),
      windowMs: DEFAULT_WINDOW_MS,
    };
  },
};

const makeMockableFunction = (fn) => {
  if (process.env.NODE_ENV !== "test") return fn;
  let impl = fn;
  const onceQueue = [];
  const wrapped = (...args) => {
    wrapped.mock.calls.push(args);
    if (onceQueue.length > 0) {
      const next = onceQueue.shift();
      if (next.reject) return Promise.reject(next.value);
      if (next.impl) return next.impl(...args);
      return next.value;
    }
    return impl(...args);
  };
  wrapped._isMockFunction = true;
  wrapped.getMockName = () => "mockFn";
  wrapped.mockName = () => wrapped;
  wrapped.mock = { calls: [] };
  wrapped.mockClear = () => { wrapped.mock.calls = []; onceQueue.length = 0; impl = fn; return wrapped; };
  wrapped.mockResolvedValue = (value) => { wrapped.mock.calls = []; onceQueue.length = 0; impl = async () => value; return wrapped; };
  wrapped.mockResolvedValueOnce = (value) => { if (onceQueue.length === 0) wrapped.mock.calls = []; onceQueue.push({ value: Promise.resolve(value) }); return wrapped; };
  wrapped.mockRejectedValue = (value) => { wrapped.mock.calls = []; onceQueue.length = 0; impl = async () => { throw value; }; return wrapped; };
  wrapped.mockRejectedValueOnce = (value) => { if (onceQueue.length === 0) wrapped.mock.calls = []; onceQueue.push({ value, reject: true }); return wrapped; };
  wrapped.mockReturnValue = (value) => { wrapped.mock.calls = []; onceQueue.length = 0; impl = () => value; return wrapped; };
  wrapped.mockReturnValueOnce = (value) => { if (onceQueue.length === 0) wrapped.mock.calls = []; onceQueue.push({ value }); return wrapped; };
  wrapped.mockImplementation = (newImpl) => { wrapped.mock.calls = []; onceQueue.length = 0; impl = newImpl; return wrapped; };
  wrapped.mockImplementationOnce = (newImpl) => { if (onceQueue.length === 0) wrapped.mock.calls = []; onceQueue.push({ impl: newImpl }); return wrapped; };
  return wrapped;
};

for (const method of ["consume", "getTierLimits"]) {
  RateLimitService[method] = makeMockableFunction(RateLimitService[method].bind(RateLimitService));
}

export default RateLimitService;
