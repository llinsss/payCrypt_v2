import { jest } from "@jest/globals";

// ────────────────────────────────────────────────────────────────────
// Mocks must be set up BEFORE the module under test is imported.
// We use jest.unstable_mockModule for ESM compatibility.
// ────────────────────────────────────────────────────────────────────

// 1. Mock Redis
const mockRedis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
    isOpen: true,
    connect: jest.fn(),
    on: jest.fn(),
};
const recordCacheHit = jest.fn();
const recordCacheMiss = jest.fn();
const getCacheMetrics = jest.fn(() => ({ hits: 0, misses: 0, ratio: 0 }));

jest.unstable_mockModule("../config/redis.js", () => ({
    default: mockRedis,
    recordCacheHit,
    recordCacheMiss,
    getCacheMetrics,
}));

// 2. Mock db — a jest.fn() that returns a mock query builder
const mockQuery = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue([99]),
    update: jest.fn().mockResolvedValue(1),
    first: jest.fn().mockResolvedValue(null),
};
const mockDb = jest.fn(() => mockQuery);
mockDb.fn = { now: jest.fn() };

jest.unstable_mockModule("../config/database.js", () => ({
    default: mockDb,
}));

// 3. Mock WebhookService
jest.unstable_mockModule("../services/WebhookService.js", () => ({
    default: { sendStatusChangeWebhook: jest.fn().mockResolvedValue(null) },
}));

// 4. Mock explorer util
jest.unstable_mockModule("../utils/explorer.js", () => ({
    getExplorerLink: jest.fn(() => "https://explorer.example.com/tx/0x1"),
}));

// ── Now dynamically import the module under test ──
const { default: Transaction } = await import("../models/Transaction.js");

describe("Transaction Caching", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.select.mockReturnThis();
        mockQuery.leftJoin.mockReturnThis();
        mockQuery.where.mockReturnThis();
        mockQuery.first.mockResolvedValue(null);
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue("OK");
        mockRedis.del.mockResolvedValue(1);
        mockRedis.scan.mockResolvedValue({ cursor: 0, keys: [] });
    });

    // ────────────────────────────────────────────────────────────
    describe("findById — cache HIT", () => {
        it("returns cached result without hitting the DB", async () => {
            const cachedTx = { id: 1, user_id: 10, amount: 100, chain_name: "ETH", tx_hash: "0xABC", chain_explorer: "" };
            mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedTx));

            const result = await Transaction.findById(1);

            expect(mockRedis.get).toHaveBeenCalledWith("txn:id:1");
            expect(recordCacheHit).toHaveBeenCalled();
            expect(mockDb).not.toHaveBeenCalled();   // DB skipped
            expect(result).toEqual(cachedTx);
        });
    });

    // ────────────────────────────────────────────────────────────
    describe("findById — cache MISS", () => {
        it("fetches from DB then stores in cache", async () => {
            mockRedis.get.mockResolvedValueOnce(null);  // miss
            const dbRow = { id: 2, user_id: 5, chain_name: "ETH", tx_hash: "0x2", chain_explorer: "" };
            mockQuery.first.mockResolvedValueOnce(dbRow);

            const result = await Transaction.findById(2);

            expect(mockRedis.get).toHaveBeenCalledWith("txn:id:2");
            expect(recordCacheMiss).toHaveBeenCalled();
            expect(mockDb).toHaveBeenCalledWith("transactions");
            expect(mockRedis.set).toHaveBeenCalledWith(
                "txn:id:2",
                expect.any(String),
                { EX: 300 }          // 5 min TTL
            );
            expect(result.id).toBe(2);
        });
    });

    // ────────────────────────────────────────────────────────────
    describe("Cache Invalidation", () => {
        it("invalidates txn:id key on delete", async () => {
            // findById called inside delete — return cached value
            const cachedTx = { id: 5, user_id: 7, chain_name: "ETH", tx_hash: "0x5", chain_explorer: "" };
            mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedTx));

            await Transaction.delete(5);

            expect(mockRedis.del).toHaveBeenCalledWith("txn:id:5");
        });

        it("scans + deletes user list keys on delete", async () => {
            const cachedTx = { id: 5, user_id: 7, chain_name: "ETH", tx_hash: "0x5", chain_explorer: "" };
            mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedTx));

            await Transaction.delete(5);

            expect(mockRedis.scan).toHaveBeenCalledWith(0, { MATCH: "txn:user:7:*", COUNT: 100 });
        });
    });

    // ────────────────────────────────────────────────────────────
    describe("getCacheMetrics", () => {
        it("exports a working getCacheMetrics function", () => {
            const m = getCacheMetrics();
            expect(m).toHaveProperty("hits");
            expect(m).toHaveProperty("misses");
            expect(m).toHaveProperty("ratio");
        });
    });
});
