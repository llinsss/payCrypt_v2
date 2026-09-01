import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// Mock redis before importing CatalogCacheService
const mockRedisClient = {
  get: jest.fn(),
  incr: jest.fn(),
};

jest.unstable_mockModule("../config/redis.js", () => ({
  redisClient: mockRedisClient,
}));

const { catalogCacheService } = await import("../services/CatalogCacheService.js");

describe("CatalogCacheService", () => {
  beforeEach(() => {
    mockRedisClient.get.mockReset();
    mockRedisClient.incr.mockReset();
  });

  describe("getVersion", () => {
    it("returns 0 when no version key exists", async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const version = await catalogCacheService.getVersion("tokens");
      expect(version).toBe(0);
    });

    it("returns the stored version number", async () => {
      mockRedisClient.get.mockResolvedValue("5");
      const version = await catalogCacheService.getVersion("tokens");
      expect(version).toBe(5);
    });

    it("returns 0 on Redis error", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("connection refused"));
      const version = await catalogCacheService.getVersion("tokens");
      expect(version).toBe(0);
    });
  });

  describe("invalidate", () => {
    it("increments the version counter in Redis", async () => {
      mockRedisClient.incr.mockResolvedValue(2);
      const newVersion = await catalogCacheService.invalidate("tokens");
      expect(newVersion).toBe(2);
      expect(mockRedisClient.incr).toHaveBeenCalledWith("cache:version:tokens");
    });

    it("returns 0 on Redis error", async () => {
      mockRedisClient.incr.mockRejectedValue(new Error("connection refused"));
      const newVersion = await catalogCacheService.invalidate("tokens");
      expect(newVersion).toBe(0);
    });
  });
});

describe("invalidateCache middleware", () => {
  it("calls catalogCacheService.invalidate on 2xx response", async () => {
    const { invalidateCache } = await import("../middleware/cacheControl.js");

    const req = {};
    const res = {
      statusCode: 201,
      json: jest.fn(),
    };
    const next = jest.fn();

    mockRedisClient.incr.mockResolvedValue(1);

    const middleware = invalidateCache("tokens");
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();

    // Simulate the controller calling res.json
    res.json({ id: 1, symbol: "USDC" });

    // Give the async invalidation a tick to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRedisClient.incr).toHaveBeenCalledWith("cache:version:tokens");
  });
});
