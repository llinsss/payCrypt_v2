import RateLimitService from "../services/RateLimitService.js";
import User from "../models/User.js";
import ApiKey from "../models/ApiKey.js";

/**
 * Get rate limit settings (tier limits)
 * GET /admin/rate-limits/settings
 */
export const getRateLimitSettings = async (req, res) => {
  try {
    const settings = await RateLimitService.getRateLimitSettings();
    res.status(200).json({ data: settings });
  } catch (error) {
    console.error("Get rate limit settings error:", error);
    res.status(500).json({ error: "Failed to retrieve rate limit settings" });
  }
};

/**
 * Get user's current rate limit status
 * GET /admin/rate-limits/users/:userId
 */
export const getUserRateLimitStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const status = await RateLimitService.getUserRateLimitStatus(userId);
    res.status(200).json({ data: status });
  } catch (error) {
    console.error("Get user rate limit status error:", error);
    res.status(500).json({ error: "Failed to retrieve user rate limit status" });
  }
};

/**
 * Update user's tier
 * PUT /admin/rate-limits/users/:userId/tier
 * Body: { tier: "FREE" | "PREMIUM" }
 */
export const updateUserTier = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tier } = req.body;

    if (!tier || !["FREE", "PREMIUM"].includes(tier)) {
      return res.status(400).json({
        error: "Invalid tier. Must be FREE or PREMIUM",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = await RateLimitService.setUserTier(userId, tier);

    res.status(200).json({
      data: {
        id: updatedUser.id,
        tier: updatedUser.tier,
      },
      message: `User tier updated to ${tier}`,
    });
  } catch (error) {
    console.error("Update user tier error:", error);
    res.status(500).json({ error: "Failed to update user tier" });
  }
};

/**
 * Get API key's current rate limit
 * GET /admin/rate-limits/api-keys/:keyId
 */
export const getApiKeyRateLimit = async (req, res) => {
  try {
    const { keyId } = req.params;
    const apiKey = await ApiKey.findById(keyId);

    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    const effectiveLimit = await RateLimitService.getEffectiveRateLimit(
      { tier: "FREE" },
      apiKey
    );

    res.status(200).json({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        rate_limit: apiKey.rate_limit,
        effective_limit: effectiveLimit,
        is_custom_limit: apiKey.rate_limit !== null && apiKey.rate_limit !== undefined,
      },
    });
  } catch (error) {
    console.error("Get API key rate limit error:", error);
    res.status(500).json({ error: "Failed to retrieve API key rate limit" });
  }
};

/**
 * Update API key's custom rate limit
 * PUT /admin/rate-limits/api-keys/:keyId/rate-limit
 * Body: { rate_limit: number | null }
 */
export const updateApiKeyRateLimit = async (req, res) => {
  try {
    const { keyId } = req.params;
    const { rate_limit } = req.body;

    if (rate_limit !== null && (typeof rate_limit !== "number" || rate_limit < 0)) {
      return res.status(400).json({
        error: "rate_limit must be a non-negative number or null",
      });
    }

    const apiKey = await ApiKey.findById(keyId);
    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    const updatedApiKey = await RateLimitService.setApiKeyRateLimit(keyId, rate_limit);

    res.status(200).json({
      data: {
        id: updatedApiKey.id,
        name: updatedApiKey.name,
        rate_limit: updatedApiKey.rate_limit,
      },
      message: rate_limit !== null
        ? `API key rate limit updated to ${rate_limit} requests per minute`
        : "API key rate limit reset to use tier default",
    });
  } catch (error) {
    console.error("Update API key rate limit error:", error);
    res.status(500).json({ error: "Failed to update API key rate limit" });
  }
};
import AuditLog from "../models/AuditLog.js";

/**
 * Get top rate limit violators
 * GET /admin/rate-limits/violations
 */
export const getRateLimitViolations = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const violations = await AuditLog.query({
      action: "rate_limit_exceeded",
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy: "created_at",
      sortOrder: "desc"
    });

    const total = await AuditLog.countByFilters({
      action: "rate_limit_exceeded"
    });

    res.status(200).json({
      data: violations,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error("Get rate limit violations error:", error);
    res.status(500).json({ error: "Failed to retrieve rate limit violations" });
  }
};
