import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockDbCount = jest.fn();
const mockDbSum = jest.fn();
const mockDbSelect = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSetex = jest.fn();

jest.unstable_mockModule("../config/database.js", () => ({
  default: (table) => ({
    where: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    sum: jest.fn().mockReturnThis(),
    first: mockDbCount,
    select: mockDbSelect,
    orderBy: jest.fn().mockReturnThis(),
  }),
}));

jest.unstable_mockModule("../config/redis.js", () => ({
  default: {
    get: mockRedisGet,
    setex: mockRedisSetex,
  },
}));

const { getPublicStats } = await import("../controllers/publicController.js");

function mockResponse() {
  const res = {};
  res.statusCode = 200;
  res.body = null;

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    res.body = payload;
    return res;
  };

  return res;
}

describe("Public Stats Controller", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getPublicStats", () => {
    it("should return cached stats if available", async () => {
      const cachedStats = {
        totalTransactions: 45320,
        totalUsers: 8750,
        totalVolume: 5234560.50,
        totalVolumeCurrency: "USD",
        supportedChains: ["stellar", "ethereum", "polygon"],
      };

      mockRedisGet.mockResolvedValue(JSON.stringify(cachedStats));

      const req = {};
      const res = mockResponse();

      await getPublicStats(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(cachedStats);
      // Should not call database if cached
      expect(mockDbCount).not.toHaveBeenCalled();
    });

    it("should compute fresh stats if cache miss", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockDbCount
        .mockResolvedValueOnce({ count: 45320 }) // transactions
        .mockResolvedValueOnce({ count: 8750 }); // users
      mockDbSum = jest.fn().mockResolvedValue({ total_volume: 5234560.50 });
      mockDbSelect.mockResolvedValue([
        { name: "Stellar" },
        { name: "Ethereum" },
        { name: "Polygon" },
      ]);
      mockRedisSetex.mockResolvedValue("OK");

      const req = {};
      const res = mockResponse();

      await getPublicStats(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalTransactions).toBe(45320);
      expect(res.body.data.totalUsers).toBe(8750);
      // Should cache the result
      expect(mockRedisSetex).toHaveBeenCalled();
    });

    it("should cache stats for 5 minutes (300 seconds)", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockDbCount.mockResolvedValueOnce({ count: 100 }).mockResolvedValueOnce({ count: 50 });
      mockRedisSetex.mockResolvedValue("OK");

      const req = {};
      const res = mockResponse();

      await getPublicStats(req, res);

      // Verify setex called with 300 second TTL
      const setexCall = mockRedisSetex.mock.calls[0];
      expect(setexCall[0]).toBe("platform:stats");
      expect(setexCall[1]).toBe(300); // 5 minutes in seconds
    });

    it("should return graceful defaults on database errors", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockDbCount.mockRejectedValue(new Error("DB connection failed"));
      mockRedisSetex.mockResolvedValue("OK");

      const req = {};
      const res = mockResponse();

      await getPublicStats(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalTransactions).toBe(0); // Fallback value
    });

    it("should return 500 on critical errors", async () => {
      mockRedisGet.mockRejectedValue(new Error("Redis connection failed"));

      const req = {};
      const res = mockResponse();

      await getPublicStats(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it("should include supportedChains in response", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockDbCount.mockResolvedValueOnce({ count: 100 }).mockResolvedValueOnce({ count: 50 });
      mockDbSelect.mockResolvedValue([
        { name: "Stellar" },
        { name: "Ethereum" },
      ]);
      mockRedisSetex.mockResolvedValue("OK");

      const req = {};
      const res = mockResponse();

      await getPublicStats(req, res);

      expect(res.body.data.supportedChains).toEqual(["stellar", "ethereum"]);
    });

    it("should return totalVolumeCurrency as USD", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockDbCount.mockResolvedValueOnce({ count: 100 }).mockResolvedValueOnce({ count: 50 });
      mockRedisSetex.mockResolvedValue("OK");

      const req = {};
      const res = mockResponse();

      await getPublicStats(req, res);

      expect(res.body.data.totalVolumeCurrency).toBe("USD");
    });
  });
});
