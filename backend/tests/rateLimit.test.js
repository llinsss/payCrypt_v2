import { jest } from "@jest/globals";

// ────────────────────────────────────────────────────────────────────
// Mocks must be set up BEFORE the module under test is imported.
// ────────────────────────────────────────────────────────────────────

const mockRedis = {
  zRemRangeByScore: jest.fn().mockResolvedValue(0),
  zCard: jest.fn().mockResolvedValue(0),
  zAdd: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(true),
  pExpire: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
  isOpen: true,
  connect: jest.fn(),
  on: jest.fn(),
};

jest.unstable_mockModule("../config/redis.js", () => ({
  default: mockRedis,
}));

const mockDbQuery = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue({ id: 1, tag: "testuser", email: "test@example.com", tier: "FREE" }),
  update: jest.fn().mockResolvedValue(1),
  insert: jest.fn().mockResolvedValue([1]),
};

const mockDb = jest.fn(() => mockDbQuery);
mockDb.fn = { now: jest.fn() };

jest.unstable_mockModule("../config/database.js", () => ({
  default: mockDb,
}));

jest.unstable_mockModule("../models/User.js", () => ({
  default: {
    findById: jest.fn().mockResolvedValue({ id: 1, tag: "testuser", email: "test@example.com", tier: "FREE" }),
    updateTier: jest.fn().mockResolvedValue({ id: 1, tier: "PREMIUM" }),
  },
}));

jest.unstable_mockModule("../models/ApiKey.js", () => ({
  default: {
    findById: jest.fn().mockResolvedValue({ id: 1, user_id: 1, name: "Test Key", rate_limit: null }),
    updateRateLimit: jest.fn().mockResolvedValue({ id: 1, user_id: 1, name: "Test Key", rate_limit: 500 }),
  },
}));

// ── Now dynamically import modules under test ──
const { userRateLimit } = await import("../middleware/userRateLimit.js");
const { apiKeyRateLimit } = await import("../middleware/apiKeyRateLimit.js");
const { TIER_LIMITS, RATE_LIMIT_TIERS } = await import("../config/rateLimiting.js");
const RateLimitService = (await import("../services/RateLimitService.js")).default;

describe("Rate Limiting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.zCard.mockResolvedValue(0);
    mockRedis.zAdd.mockResolvedValue(1);
    mockRedis.zRemRangeByScore.mockResolvedValue(0);
  });

  describe("TIER_LIMITS constants", () => {
    it("should have FREE tier with 100 requests per minute", () => {
      expect(TIER_LIMITS.FREE).toBe(100);
    });

    it("should have PREMIUM tier with 1000 requests per minute", () => {
      expect(TIER_LIMITS.PREMIUM).toBe(1000);
    });
  });

  describe("RATE_LIMIT_TIERS constants", () => {
    it("should define FREE and PREMIUM tier values", () => {
      expect(RATE_LIMIT_TIERS.FREE).toBe("FREE");
      expect(RATE_LIMIT_TIERS.PREMIUM).toBe("PREMIUM");
    });
  });

  describe("userRateLimit middleware", () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        user: { id: 1, tier: "FREE" },
        apiKey: null,
        ip: "127.0.0.1",
        connection: { remoteAddress: "127.0.0.1" },
      };
      mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      mockNext = jest.fn();
    });

    it("should allow request when under rate limit", async () => {
      mockRedis.zCard.mockResolvedValue(5);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
    });

    it("should reject request when rate limit exceeded for FREE tier", async () => {
      mockRedis.zCard.mockResolvedValue(100);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("FREE"),
          tier: "FREE",
          limit: 100,
        })
      );
    });

    it("should use PREMIUM tier limit for premium users", async () => {
      mockReq.user.tier = "PREMIUM";
      mockRedis.zCard.mockResolvedValue(500);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "1000");
    });

    it("should skip rate limiting when no user is present", async () => {
      mockReq.user = null;

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedis.zCard).not.toHaveBeenCalled();
    });

    it("should include rate limit headers in response", async () => {
      mockRedis.zCard.mockResolvedValue(10);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", expect.any(String));
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.zCard.mockRejectedValue(new Error("Redis connection error"));

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("apiKeyRateLimit middleware", () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        user: null,
        apiKey: { id: 1, rate_limit: null },
        ip: "127.0.0.1",
        connection: { remoteAddress: "127.0.0.1" },
      };
      mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      mockNext = jest.fn();
    });

    it("should allow request when under custom API key rate limit", async () => {
      mockRedis.zCard.mockResolvedValue(5);

      await apiKeyRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
    });

    it("should reject request when custom API key rate limit exceeded", async () => {
      mockReq.apiKey.rate_limit = 50;
      mockRedis.zCard.mockResolvedValue(50);

      await apiKeyRateLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("50"),
          limit: 50,
          isCustomLimit: true,
        })
      );
    });

    it("should skip rate limiting when no API key is present", async () => {
      mockReq.apiKey = null;

      await apiKeyRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedis.zCard).not.toHaveBeenCalled();
    });

    it("should use custom rate limit from API key when set", async () => {
      mockReq.apiKey.rate_limit = 500;
      mockRedis.zCard.mockResolvedValue(100);

      await apiKeyRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "500");
    });
  });

  describe("RateLimitService", () => {
    it("should return FREE tier when user has no tier", async () => {
      const tier = await RateLimitService.getUserTier(999);
      expect(tier).toBe("FREE");
    });

    it("should return tier from user object", async () => {
      const tier = await RateLimitService.getUserTier(1);
      expect(tier).toBe("FREE");
    });

    it("should return null for API key rate limit when not set", async () => {
      const limit = await RateLimitService.getApiKeyRateLimit(1);
      expect(limit).toBeNull();
    });

    it("should return effective rate limit for API key with custom limit", async () => {
      const limit = await RateLimitService.getEffectiveRateLimit(
        { tier: "FREE" },
        { rate_limit: 500 }
      );
      expect(limit).toBe(500);
    });

    it("should return tier limit when API key has no custom limit", async () => {
      const limit = await RateLimitService.getEffectiveRateLimit(
        { tier: "PREMIUM" },
        { rate_limit: null }
      );
      expect(limit).toBe(1000);
    });

    it("should return FREE tier limit for user without tier", async () => {
      const limit = await RateLimitService.getEffectiveRateLimit(
        { tier: null },
        { rate_limit: null }
      );
      expect(limit).toBe(100);
    });

    it("should throw error for invalid tier", async () => {
      await expect(RateLimitService.setUserTier(1, "INVALID")).rejects.toThrow("Invalid tier");
    });

    it("should throw error for invalid rate_limit", async () => {
      await expect(RateLimitService.setApiKeyRateLimit(1, -1)).rejects.toThrow("rate_limit must be");
    });

    it("should return rate limit settings", async () => {
      const settings = await RateLimitService.getRateLimitSettings();
      expect(settings).toHaveProperty("tiers");
      expect(settings).toHaveProperty("defaults");
      expect(settings.tiers.FREE.limit).toBe(100);
      expect(settings.tiers.PREMIUM.limit).toBe(1000);
    });

    it("should return user rate limit status", async () => {
      const status = await RateLimitService.getUserRateLimitStatus(1);
      expect(status).toHaveProperty("userId", 1);
      expect(status).toHaveProperty("tier", "FREE");
      expect(status).toHaveProperty("limit", 100);
      expect(status).toHaveProperty("windowMs", 60000);
    });
  });

  describe("Rate Limit Headers", () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        user: { id: 1, tier: "FREE" },
        apiKey: null,
        ip: "127.0.0.1",
        connection: { remoteAddress: "127.0.0.1" },
      };
      mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      mockNext = jest.fn();
    });

    it("should set all required rate limit headers", async () => {
      mockRedis.zCard.mockResolvedValue(5);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", expect.any(String));
    });

    it("should set Retry-After header when limit exceeded", async () => {
      mockRedis.zCard.mockResolvedValue(100);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });
  });

  describe("Redis Sliding Window Algorithm", () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        user: { id: 1, tier: "FREE" },
        apiKey: null,
        ip: "127.0.0.1",
        connection: { remoteAddress: "127.0.0.1" },
      };
      mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      mockNext = jest.fn();
    });

    it("should use sorted set for sliding window", async () => {
      mockRedis.zCard.mockResolvedValue(50);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockRedis.zRemRangeByScore).toHaveBeenCalled();
      expect(mockRedis.zCard).toHaveBeenCalled();
      expect(mockRedis.zAdd).toHaveBeenCalled();
    });

    it("should set expiry on rate limit keys", async () => {
      mockRedis.zCard.mockResolvedValue(50);

      await userRateLimit(mockReq, mockRes, mockNext);

      expect(mockRedis.expire).toHaveBeenCalled();
    });
  });
});
