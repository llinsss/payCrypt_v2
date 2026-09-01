import { jest } from "@jest/globals";

const mockRedis = {
  zRemRangeByScore: jest.fn().mockResolvedValue(0),
  zCard: jest.fn().mockResolvedValue(5),
  zAdd: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(true),
};

jest.unstable_mockModule("../config/redis.js", () => ({
  default: mockRedis,
}));

const { RATE_LIMIT_TIERS, TIER_LIMITS, getOperationLimit, validateRateLimitConfig } =
  await import("../config/rateLimiting.js");
const { userRateLimit } = await import("../middleware/userRateLimit.js");

describe("Rate-Limit Tier Contract (#496)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.zCard.mockResolvedValue(5);
  });

  describe("Tier Schema - Per-Operation Structure", () => {
    it("should define TIER_LIMITS as per-operation objects, not plain numbers", () => {
      expect(typeof TIER_LIMITS.FREE).toBe("object");
      expect(typeof TIER_LIMITS.PREMIUM).toBe("object");
      expect(typeof TIER_LIMITS.ENTERPRISE).toBe("object");
    });

    it("should have numeric limits for each operation per tier", () => {
      expect(typeof TIER_LIMITS.FREE.api).toBe("number");
      expect(typeof TIER_LIMITS.FREE.login).toBe("number");
      expect(typeof TIER_LIMITS.FREE.transactions).toBe("number");
      expect(typeof TIER_LIMITS.FREE.swap).toBe("number");
      expect(TIER_LIMITS.FREE.api).toBe(1000);
      expect(TIER_LIMITS.FREE.login).toBe(5);
    });

    it("should have all operations with positive limits", () => {
      const tiers = Object.values(RATE_LIMIT_TIERS);
      for (const tierName of tiers) {
        const tierConfig = TIER_LIMITS[tierName];
        for (const [op, limit] of Object.entries(tierConfig)) {
          expect(typeof limit).toBe("number");
          expect(limit).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("getOperationLimit() - Operation Lookup", () => {
    it("should resolve numeric limit for (tier, operation) tuple", () => {
      expect(getOperationLimit("FREE", "login")).toBe(5);
      expect(getOperationLimit("FREE", "transactions")).toBe(100);
      expect(getOperationLimit("FREE", "swap")).toBe(60);
      expect(getOperationLimit("FREE", "api")).toBe(1000);
    });

    it("should return api default when operation not found", () => {
      expect(getOperationLimit("FREE", "unknown-op")).toBe(1000);
    });

    it("should respect tier hierarchy - PREMIUM > FREE", () => {
      expect(getOperationLimit("PREMIUM", "login")).toBeGreaterThan(getOperationLimit("FREE", "login"));
      expect(getOperationLimit("ENTERPRISE", "api")).toBeGreaterThan(getOperationLimit("PREMIUM", "api"));
    });

    it("should throw on invalid tier", () => {
      expect(() => getOperationLimit("INVALID_TIER", "api")).toThrow(/Invalid tier/i);
    });

    it("should throw on invalid operation limit value (non-numeric)", () => {
      const originalLimit = TIER_LIMITS.FREE.api;
      TIER_LIMITS.FREE.api = "not-a-number";
      expect(() => getOperationLimit("FREE", "api")).toThrow(/Invalid operation limit/i);
      TIER_LIMITS.FREE.api = originalLimit;
    });

    it("should throw on negative limit", () => {
      const originalLimit = TIER_LIMITS.FREE.api;
      TIER_LIMITS.FREE.api = -1;
      expect(() => getOperationLimit("FREE", "api")).toThrow(/Invalid operation limit/i);
      TIER_LIMITS.FREE.api = originalLimit;
    });
  });

  describe("Config Validation - validateRateLimitConfig()", () => {
    it("should pass validation with correct tier schema", () => {
      expect(() => validateRateLimitConfig()).not.toThrow();
    });

    it("should detect malformed tier configs at startup", () => {
      const originalFree = TIER_LIMITS.FREE;
      TIER_LIMITS.FREE = "invalid";
      expect(() => validateRateLimitConfig()).toThrow(/validation failed/i);
      TIER_LIMITS.FREE = originalFree;
    });

    it("should detect non-numeric operation limits", () => {
      const originalLimit = TIER_LIMITS.PREMIUM.login;
      TIER_LIMITS.PREMIUM.login = "not-a-number";
      expect(() => validateRateLimitConfig()).toThrow(/validation failed/i);
      TIER_LIMITS.PREMIUM.login = originalLimit;
    });

    it("should detect negative operation limits", () => {
      const originalLimit = TIER_LIMITS.ENTERPRISE.api;
      TIER_LIMITS.ENTERPRISE.api = -100;
      expect(() => validateRateLimitConfig()).toThrow(/validation failed/i);
      TIER_LIMITS.ENTERPRISE.api = originalLimit;
    });
  });

  describe("Middleware - userRateLimit with Numeric Headers", () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        user: { id: 1, tier: "FREE" },
        ip: "127.0.0.1",
      };
      mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      mockNext = jest.fn();
    });

    it("should set numeric X-RateLimit-Limit header, never [object Object]", async () => {
      mockRedis.zCard.mockResolvedValue(3);
      await userRateLimit(mockReq, mockRes, mockNext);

      const calls = mockRes.setHeader.mock.calls;
      const limitCall = calls.find(c => c[0] === "X-RateLimit-Limit");
      expect(limitCall).toBeDefined();
      expect(limitCall[1]).toBe("1000");
      expect(limitCall[1]).not.toBe("[object Object]");
    });

    it("should set numeric X-RateLimit-Remaining header, never NaN", async () => {
      mockRedis.zCard.mockResolvedValue(5);
      await userRateLimit(mockReq, mockRes, mockNext);

      const calls = mockRes.setHeader.mock.calls;
      const remainingCall = calls.find(c => c[0] === "X-RateLimit-Remaining");
      expect(remainingCall).toBeDefined();
      const remaining = parseInt(remainingCall[1], 10);
      expect(Number.isNaN(remaining)).toBe(false);
      expect(remaining).toBe(994);
    });

    it("should handle zero remaining requests gracefully", async () => {
      mockRedis.zCard.mockResolvedValue(1000);
      await userRateLimit(mockReq, mockRes, mockNext);

      const remainingCall = mockRes.setHeader.mock.calls.find(c => c[0] === "X-RateLimit-Remaining");
      const remaining = parseInt(remainingCall[1], 10);
      expect(remaining).toBe(0);
      expect(Number.isNaN(remaining)).toBe(false);
    });

    it("should differentiate between tiers in headers", async () => {
      mockRedis.zCard.mockResolvedValue(10);

      // Test FREE tier
      await userRateLimit(mockReq, mockRes, mockNext);
      let limitCall = mockRes.setHeader.mock.calls.find(c => c[0] === "X-RateLimit-Limit");
      expect(limitCall[1]).toBe("1000");

      // Test PREMIUM tier
      jest.clearAllMocks();
      mockReq.user.tier = "PREMIUM";
      mockRedis.zCard.mockResolvedValue(10);
      mockRes.setHeader.mockClear();

      await userRateLimit(mockReq, mockRes, mockNext);
      limitCall = mockRes.setHeader.mock.calls.find(c => c[0] === "X-RateLimit-Limit");
      expect(limitCall[1]).toBe("5000");
    });

    it("should handle ENTERPRISE tier with highest limits", async () => {
      mockReq.user.tier = "ENTERPRISE";
      mockRedis.zCard.mockResolvedValue(20);

      await userRateLimit(mockReq, mockRes, mockNext);

      const limitCall = mockRes.setHeader.mock.calls.find(c => c[0] === "X-RateLimit-Limit");
      expect(parseInt(limitCall[1], 10)).toBe(50000);
    });
  });

  describe("Edge Cases - Robustness", () => {
    it("should default to FREE tier when tier is null/undefined", () => {
      expect(getOperationLimit(null, "api")).toBe(TIER_LIMITS.FREE.api);
      expect(getOperationLimit(undefined, "api")).toBe(TIER_LIMITS.FREE.api);
    });

    it("should always return finite numeric values", () => {
      const tiers = Object.keys(RATE_LIMIT_TIERS);
      const ops = Object.keys(TIER_LIMITS.FREE);

      for (const tier of tiers) {
        for (const op of ops) {
          const limit = getOperationLimit(tier, op);
          expect(Number.isFinite(limit)).toBe(true);
          expect(limit > 0).toBe(true);
        }
      }
    });
  });
});
