import { jest } from "@jest/globals";

// Stub Redis before importing the cache service
const mockRedis = {
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
};

jest.unstable_mockModule("../../config/redis.js", () => ({
  default: mockRedis,
}));

jest.unstable_mockModule("../../utils/logger.js", () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: catalogCache } = await import(
  "../../services/CatalogCacheService.js"
);

describe("CatalogCacheService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("get()", () => {
    it("returns parsed JSON on cache hit", async () => {
      const data = [{ id: 1, symbol: "XLM" }];
      mockRedis.get.mockResolvedValue(JSON.stringify(data));

      const result = await catalogCache.get("tokens", 1, 10);
      expect(result).toEqual(data);
      expect(mockRedis.get).toHaveBeenCalledWith("catalog:tokens:1:10");
    });

    it("returns null on cache miss", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await catalogCache.get("tokens", 1, 10);
      expect(result).toBeNull();
    });

    it("returns null and does not throw on Redis error", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis down"));

      const result = await catalogCache.get("tokens", 1, 10);
      expect(result).toBeNull();
    });
  });

  describe("set()", () => {
    it("stores data with TTL", async () => {
      mockRedis.setEx.mockResolvedValue("OK");

      await catalogCache.set("chains", 2, 5, [{ id: 1 }]);
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        "catalog:chains:2:5",
        3600,
        JSON.stringify([{ id: 1 }]),
      );
    });
  });

  describe("invalidate()", () => {
    it("deletes all keys matching the catalog pattern", async () => {
      mockRedis.scan.mockResolvedValue({
        cursor: 0,
        keys: ["catalog:tokens:1:10", "catalog:tokens:2:10"],
      });
      mockRedis.del.mockResolvedValue(2);

      await catalogCache.invalidate("tokens");
      expect(mockRedis.scan).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith([
        "catalog:tokens:1:10",
        "catalog:tokens:2:10",
      ]);
    });

    it("handles empty scan result gracefully", async () => {
      mockRedis.scan.mockResolvedValue({ cursor: 0, keys: [] });

      await catalogCache.invalidate("tokens");
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it("mutation is visible on next read after invalidation", async () => {
      // Simulate: cache hit, then invalidation, then cache miss
      const original = [{ id: 1, symbol: "XLM" }];
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(original));

      // Read returns cached data
      const first = await catalogCache.get("tokens", 1, 10);
      expect(first).toEqual(original);

      // Invalidate
      mockRedis.scan.mockResolvedValue({
        cursor: 0,
        keys: ["catalog:tokens:1:10"],
      });
      mockRedis.del.mockResolvedValue(1);
      await catalogCache.invalidate("tokens");

      // Next read returns null (cache miss), forcing a fresh DB query
      mockRedis.get.mockResolvedValueOnce(null);
      const second = await catalogCache.get("tokens", 1, 10);
      expect(second).toBeNull();
    });
  });
});
