import { jest } from "@jest/globals";

const mockRedis = {
  eval: jest.fn().mockResolvedValue(["true", "50"]),
  zRemRangeByScore: jest.fn().mockResolvedValue(0),
  zCard: jest.fn().mockResolvedValue(10),
  zAdd: jest.fn().mockResolvedValue(1),
};

jest.unstable_mockModule("../config/redis.js", () => ({
  default: mockRedis,
}));

const mockUserModel = {
  findById: jest.fn(),
  updateTier: jest.fn(),
};

jest.unstable_mockModule("../models/User.js", () => ({
  default: mockUserModel,
}));

const mockApiKeyModel = {
  findById: jest.fn(),
  updateRateLimit: jest.fn(),
};

jest.unstable_mockModule("../models/ApiKey.js", () => ({
  default: mockApiKeyModel,
}));

const RateLimitService = (await import("../services/RateLimitService.js")).default;
const { RATE_LIMIT_TIERS, getOperationLimit } = await import("../config/rateLimiting.js");

describe("RateLimitService - Public API (#497)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("consume() - Token Bucket Algorithm", () => {
    it("should return allowed=true when tokens available", async () => {
      mockRedis.eval.mockResolvedValueOnce(["true", "99"]);
      const result = await RateLimitService.consume("test:key", 100, 0.1);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
      expect(result.error).toBeUndefined();
    });

    it("should return allowed=false when no tokens available", async () => {
      mockRedis.eval.mockResolvedValueOnce(["false", "0"]);
      const result = await RateLimitService.consume("test:key", 100, 0.1);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should handle Redis failures gracefully", async () => {
      mockRedis.eval.mockRejectedValueOnce(new Error("Redis connection lost"));
      const result = await RateLimitService.consume("test:key", 100, 0.1);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.error).toContain("failure");
    });

    it("should pass correct arguments to Redis eval", async () => {
      mockRedis.eval.mockResolvedValueOnce(["true", "50"]);
      await RateLimitService.consume("my:key", 1000, 0.5);

      const call = mockRedis.eval.mock.calls[0];
      expect(call[1].keys).toContain("my:key");
      expect(call[1].arguments).toContain("1000");
      expect(call[1].arguments).toContain("0.5");
    });
  });

  describe("getTierLimits() - Operation Resolution", () => {
    it("should return capacity and refillRate for tier + operation", () => {
      const result = RateLimitService.getTierLimits("FREE", "login");

      expect(result.capacity).toBe(5);
      expect(result.refillRatePerMs).toBeCloseTo(5 / (60 * 60 * 1000), 10);
    });

    it("should differentiate between operations within same tier", () => {
      const login = RateLimitService.getTierLimits("PREMIUM", "login");
      const api = RateLimitService.getTierLimits("PREMIUM", "api");

      expect(login.capacity).toBe(20);
      expect(api.capacity).toBe(5000);
      expect(api.capacity).toBeGreaterThan(login.capacity);
    });

    it("should respect tier hierarchy - PREMIUM > FREE", () => {
      const freeApi = RateLimitService.getTierLimits("FREE", "api");
      const premiumApi = RateLimitService.getTierLimits("PREMIUM", "api");

      expect(premiumApi.capacity).toBeGreaterThan(freeApi.capacity);
    });

    it("should use api operation as default when operation not found", () => {
      const unknown = RateLimitService.getTierLimits("FREE", "unknown-op");
      const api = RateLimitService.getTierLimits("FREE", "api");

      expect(unknown.capacity).toBe(api.capacity);
    });

    it("should throw on invalid tier", () => {
      expect(() => RateLimitService.getTierLimits("INVALID", "api")).toThrow(/Invalid tier/i);
    });

    it("should handle null/undefined tier by defaulting to FREE", () => {
      const nullTier = RateLimitService.getTierLimits(null, "api");
      const undefinedTier = RateLimitService.getTierLimits(undefined, "api");
      const freeTier = RateLimitService.getTierLimits("FREE", "api");

      expect(nullTier.capacity).toBe(freeTier.capacity);
      expect(undefinedTier.capacity).toBe(freeTier.capacity);
    });
  });

  describe("getUserTier() - Database Lookup", () => {
    it("should return user tier from database", async () => {
      mockUserModel.findById.mockResolvedValueOnce({ id: 1, tier: "PREMIUM", email: "test@example.com" });

      const tier = await RateLimitService.getUserTier(1);

      expect(tier).toBe("PREMIUM");
      expect(mockUserModel.findById).toHaveBeenCalledWith(1);
    });

    it("should return FREE tier if user not found", async () => {
      mockUserModel.findById.mockResolvedValueOnce(null);

      const tier = await RateLimitService.getUserTier(999);

      expect(tier).toBe("FREE");
    });

    it("should return FREE tier if user has no tier set", async () => {
      mockUserModel.findById.mockResolvedValueOnce({ id: 1, email: "test@example.com", tier: null });

      const tier = await RateLimitService.getUserTier(1);

      expect(tier).toBe("FREE");
    });

    it("should propagate database errors", async () => {
      mockUserModel.findById.mockRejectedValueOnce(new Error("DB connection failed"));

      await expect(RateLimitService.getUserTier(1)).rejects.toThrow("DB connection failed");
    });
  });

  describe("getApiKeyRateLimit() - API Key Override", () => {
    it("should return custom rate limit when set on API key", async () => {
      mockApiKeyModel.findById.mockResolvedValueOnce({ id: 1, user_id: 1, rate_limit: 500 });

      const limit = await RateLimitService.getApiKeyRateLimit(1);

      expect(limit).toBe(500);
    });

    it("should return null when API key has no custom limit", async () => {
      mockApiKeyModel.findById.mockResolvedValueOnce({ id: 1, user_id: 1, rate_limit: null });

      const limit = await RateLimitService.getApiKeyRateLimit(1);

      expect(limit).toBeNull();
    });

    it("should return null when API key not found", async () => {
      mockApiKeyModel.findById.mockResolvedValueOnce(null);

      const limit = await RateLimitService.getApiKeyRateLimit(999);

      expect(limit).toBeNull();
    });

    it("should propagate database errors", async () => {
      mockApiKeyModel.findById.mockRejectedValueOnce(new Error("DB unavailable"));

      await expect(RateLimitService.getApiKeyRateLimit(1)).rejects.toThrow("DB unavailable");
    });
  });

  describe("getEffectiveRateLimit() - Precedence Logic", () => {
    it("should prioritize API key custom limit over tier", async () => {
      const user = { tier: "FREE" };
      const apiKey = { rate_limit: 300 };

      const limit = await RateLimitService.getEffectiveRateLimit(user, apiKey);

      expect(limit).toBe(300);
    });

    it("should use tier limit when API key has no override", async () => {
      const user = { tier: "PREMIUM" };
      const apiKey = { rate_limit: null };

      const limit = await RateLimitService.getEffectiveRateLimit(user, apiKey);

      expect(limit).toBe(5000);
    });

    it("should default to FREE tier when user has no tier", async () => {
      const user = { tier: null };
      const apiKey = { rate_limit: null };

      const limit = await RateLimitService.getEffectiveRateLimit(user, apiKey);

      expect(limit).toBe(1000);
    });

    it("should handle missing user and apiKey objects", async () => {
      const limit = await RateLimitService.getEffectiveRateLimit({}, {});

      expect(limit).toBe(1000);
    });
  });

  describe("setUserTier() - Tier Mutation", () => {
    it("should update user tier and return result", async () => {
      mockUserModel.updateTier.mockResolvedValueOnce({ id: 1, tier: "PREMIUM" });

      const result = await RateLimitService.setUserTier(1, "PREMIUM");

      expect(result.tier).toBe("PREMIUM");
      expect(mockUserModel.updateTier).toHaveBeenCalledWith(1, "PREMIUM");
    });

    it("should throw on invalid tier", async () => {
      await expect(RateLimitService.setUserTier(1, "INVALID_TIER")).rejects.toThrow(/Invalid tier/i);
    });

    it("should accept all valid tiers", async () => {
      mockUserModel.updateTier.mockResolvedValue({ id: 1, tier: "ENTERPRISE" });

      const tiers = ["FREE", "PREMIUM", "ENTERPRISE"];
      for (const tier of tiers) {
        await RateLimitService.setUserTier(1, tier);
        expect(mockUserModel.updateTier).toHaveBeenCalledWith(1, tier);
      }
    });

    it("should propagate database errors", async () => {
      mockUserModel.updateTier.mockRejectedValueOnce(new Error("Tier does not exist"));

      await expect(RateLimitService.setUserTier(1, "FREE")).rejects.toThrow("Tier does not exist");
    });
  });

  describe("setApiKeyRateLimit() - Custom Limit Mutation", () => {
    it("should update API key rate limit", async () => {
      mockApiKeyModel.updateRateLimit.mockResolvedValueOnce({ id: 1, rate_limit: 750 });

      const result = await RateLimitService.setApiKeyRateLimit(1, 750);

      expect(result.rate_limit).toBe(750);
      expect(mockApiKeyModel.updateRateLimit).toHaveBeenCalledWith(1, 750);
    });

    it("should allow zero as valid rate limit", async () => {
      mockApiKeyModel.updateRateLimit.mockResolvedValueOnce({ id: 1, rate_limit: 0 });

      const result = await RateLimitService.setApiKeyRateLimit(1, 0);

      expect(result.rate_limit).toBe(0);
    });

    it("should reject negative rate limit", async () => {
      await expect(RateLimitService.setApiKeyRateLimit(1, -1)).rejects.toThrow(/non-negative integer/i);
    });

    it("should reject non-integer rate limit", async () => {
      await expect(RateLimitService.setApiKeyRateLimit(1, 50.5)).rejects.toThrow(/non-negative integer/i);
    });

    it("should reject string rate limit", async () => {
      await expect(RateLimitService.setApiKeyRateLimit(1, "100")).rejects.toThrow(/non-negative integer/i);
    });

    it("should propagate database errors", async () => {
      mockApiKeyModel.updateRateLimit.mockRejectedValueOnce(new Error("API key not found"));

      await expect(RateLimitService.setApiKeyRateLimit(1, 500)).rejects.toThrow("API key not found");
    });
  });

  describe("getRateLimitSettings() - Configuration Introspection", () => {
    it("should return tiers with per-operation limits", async () => {
      const settings = await RateLimitService.getRateLimitSettings();

      expect(settings.tiers).toBeDefined();
      expect(settings.tiers.FREE).toBeDefined();
      expect(settings.tiers.PREMIUM).toBeDefined();
      expect(settings.tiers.ENTERPRISE).toBeDefined();
    });

    it("should include operations in tier config", async () => {
      const settings = await RateLimitService.getRateLimitSettings();

      expect(settings.tiers.FREE.operations).toBeDefined();
      expect(settings.tiers.FREE.operations.login).toBe(5);
      expect(settings.tiers.FREE.operations.api).toBe(1000);
    });

    it("should include window and baseline limits", async () => {
      const settings = await RateLimitService.getRateLimitSettings();

      expect(settings.tiers.FREE.windowMs).toBe(60 * 1000);
      expect(settings.tiers.FREE.baselineLimit).toBe(1000);
    });

    it("should include defaults section", async () => {
      const settings = await RateLimitService.getRateLimitSettings();

      expect(settings.defaults.windowMs).toBe(60 * 1000);
      expect(settings.defaults.tier).toBe("FREE");
      expect(settings.defaults.limit).toBe(1000);
    });
  });

  describe("getUserRateLimitStatus() - Status Introspection", () => {
    it("should return complete status for user", async () => {
      mockUserModel.findById.mockResolvedValueOnce({ id: 5, tier: "PREMIUM" });

      const status = await RateLimitService.getUserRateLimitStatus(5);

      expect(status.userId).toBe(5);
      expect(status.tier).toBe("PREMIUM");
      expect(status.limit).toBe(5000);
      expect(status.windowMs).toBe(60 * 1000);
    });

    it("should include all required status fields", async () => {
      mockUserModel.findById.mockResolvedValueOnce({ id: 1, tier: "FREE" });

      const status = await RateLimitService.getUserRateLimitStatus(1);

      expect(Object.keys(status)).toContain("userId");
      expect(Object.keys(status)).toContain("tier");
      expect(Object.keys(status)).toContain("limit");
      expect(Object.keys(status)).toContain("windowMs");
    });

    it("should default to FREE tier and limit when user not found", async () => {
      mockUserModel.findById.mockResolvedValueOnce(null);

      const status = await RateLimitService.getUserRateLimitStatus(999);

      expect(status.tier).toBe("FREE");
      expect(status.limit).toBe(1000);
    });
  });
});
