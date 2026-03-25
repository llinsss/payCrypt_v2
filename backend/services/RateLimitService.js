import User from "../models/User.js";
import ApiKey from "../models/ApiKey.js";
import { TIER_LIMITS, RATE_LIMIT_TIERS } from "../config/rateLimiting.js";

const RateLimitService = {
  async getUserTier(userId) {
    const user = await User.findById(userId);
    return user?.tier || RATE_LIMIT_TIERS.FREE;
  },

  async getApiKeyRateLimit(apiKeyId) {
    const apiKey = await ApiKey.findById(apiKeyId);
    return apiKey?.rate_limit || null;
  },

  async getEffectiveRateLimit(user, apiKey) {
    if (apiKey?.rate_limit !== null && apiKey?.rate_limit !== undefined) {
      return apiKey.rate_limit;
    }

    const tier = user?.tier || RATE_LIMIT_TIERS.FREE;
    return TIER_LIMITS[tier] || TIER_LIMITS.FREE;
  },

  async setUserTier(userId, tier) {
    if (!Object.values(RATE_LIMIT_TIERS).includes(tier)) {
      throw new Error(`Invalid tier: ${tier}. Must be FREE or PREMIUM`);
    }
    return await User.updateTier(userId, tier);
  },

  async setApiKeyRateLimit(apiKeyId, rateLimit) {
    if (rateLimit !== null && (typeof rateLimit !== "number" || rateLimit < 0)) {
      throw new Error("rate_limit must be a non-negative number or null");
    }
    return await ApiKey.updateRateLimit(apiKeyId, rateLimit);
  },

  async getRateLimitSettings() {
    return {
      tiers: {
        FREE: {
          tier: RATE_LIMIT_TIERS.FREE,
          limit: TIER_LIMITS.FREE,
          windowMs: 60000,
        },
        PREMIUM: {
          tier: RATE_LIMIT_TIERS.PREMIUM,
          limit: TIER_LIMITS.PREMIUM,
          windowMs: 60000,
        },
      },
      defaults: {
        freeTierLimit: TIER_LIMITS.FREE,
        premiumTierLimit: TIER_LIMITS.PREMIUM,
      },
    };
  },

  async getUserRateLimitStatus(userId) {
    const tier = await this.getUserTier(userId);
    return {
      userId,
      tier,
      limit: TIER_LIMITS[tier] || TIER_LIMITS.FREE,
      windowMs: 60000,
    };
  },
};

export default RateLimitService;
