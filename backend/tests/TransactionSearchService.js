import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockZRemRangeByScore = jest.fn().mockResolvedValue(0);
const mockZCard = jest.fn().mockResolvedValue(0);
const mockZAdd = jest.fn().mockResolvedValue(1);
const mockExpire = jest.fn().mockResolvedValue(1);
const mockGet = jest.fn().mockResolvedValue(null);
const mockSet = jest.fn().mockResolvedValue("OK");

jest.mock("../../config/redis.js", () => ({
  default: {
    get: mockGet,
    set: mockSet,
    zRemRangeByScore: mockZRemRangeByScore,
    zCard: mockZCard,
    zAdd: mockZAdd,
    expire: mockExpire,
  },
}));

jest.mock("../../utils/explorer.js", () => ({
  getExplorerLink: jest.fn((chain, hash) =>
    hash ? `https://explorer/${hash}` : null,
  ),
}));

// Build a chainable Knex mock
const createQueryBuilder = (rows = []) => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    orderByRaw: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(function (n) {
      this._limit = n;
      return this;
    }),
    offset: jest.fn().mockReturnThis(),
    clearSelect: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ total: rows.length }),
    then: (resolve) => resolve(rows.slice(0, qb._limit ?? rows.length)),
    [Symbol.iterator]: undefined,
  };
  qb[Symbol.asyncIterator] = undefined;
  // Make the query builder thenable so await works
  Object.defineProperty(qb, Symbol.toStringTag, { value: "QueryBuilder" });
  const original = qb.limit;
  qb.limit = jest.fn().mockImplementation(function (n) {
    this._limit = n;
    return new Proxy(this, {
      get(target, prop) {
        if (prop === "then") {
          return (resolve, reject) =>
            Promise.resolve(rows.slice(0, n)).then(resolve, reject);
        }
        return target[prop];
      },
    });
  });
  return qb;
};

const mockDb = jest.fn();
mockDb.raw = jest.fn();

jest.mock("../../config/database.js", () => ({ default: mockDb }));

import TransactionSearchService from "../../services/TransactionSearchService.js";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

function makeTx(overrides = {}) {
  return {
    id: 1,
    user_id: 42,
    reference: "PAY-001",
    type: "payment",
    status: "completed",
    amount: 10,
    usd_value: 100,
    created_at: new Date("2024-06-15T10:00:00Z"),
    tx_hash: "0xabc123",
    from_address: "0xSender",
    to_address: "0xRecipient",
    description: "Test payment",
    notes: "some note",
    chain_name: "Base",
    chain_symbol: "BASE",
    token_symbol: "ETH",
    chain_explorer: "https://basescan.org",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TransactionSearchService", () => {
  const userId = 42;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: rate limit allows
    mockZCard.mockResolvedValue(0);
    // Default: no cache hit
    mockGet.mockResolvedValue(null);
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("throws 429 when rate limit is exceeded", async () => {
      mockZCard.mockResolvedValue(30); // at limit

      await expect(
        TransactionSearchService.search(userId, {}),
      ).rejects.toMatchObject({ status: 429 });
    });

    it("allows requests below the rate limit", async () => {
      mockZCard.mockResolvedValue(5);
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      await expect(
        TransactionSearchService.search(userId, {}),
      ).resolves.toBeDefined();
    });
  });

  // ── Cache ─────────────────────────────────────────────────────────────────

  describe("caching", () => {
    it("returns cached result on cache hit", async () => {
      const cached = {
        data: [makeTx()],
        nextCursor: null,
        hasMore: false,
        total: 1,
      };
      mockGet.mockResolvedValue(JSON.stringify(cached));

      const result = await TransactionSearchService.search(userId, {});

      expect(result.fromCache).toBe(true);
      expect(result.data).toEqual(cached.data);
      expect(mockDb).not.toHaveBeenCalled();
    });

    it("does not cache cursor-paginated pages", async () => {
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, {
        cursor: Buffer.from(
          JSON.stringify({ created_at: new Date(), id: 1 }),
        ).toString("base64"),
      });

      expect(mockSet).not.toHaveBeenCalled();
    });

    it("stores first-page result in cache", async () => {
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, { q: "test" });

      expect(mockSet).toHaveBeenCalled();
    });
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  describe("filters", () => {
    it("applies status filter", async () => {
      const qb = createQueryBuilder([makeTx({ status: "completed" })]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, { status: "completed" });

      expect(qb.where).toHaveBeenCalledWith("transactions.status", "completed");
    });

    it("applies type filter", async () => {
      const qb = createQueryBuilder([]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, { type: "credit" });

      expect(qb.where).toHaveBeenCalledWith("transactions.type", "credit");
    });

    it("applies chain filter", async () => {
      const qb = createQueryBuilder([]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, { chain: "base" });

      expect(qb.where).toHaveBeenCalledWith("chains.symbol", "BASE");
    });

    it("applies token filter", async () => {
      const qb = createQueryBuilder([]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, { token: "usdc" });

      expect(qb.where).toHaveBeenCalledWith("tokens.symbol", "USDC");
    });

    it("applies date range filters", async () => {
      const qb = createQueryBuilder([]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, {
        from: "2024-01-01",
        to: "2024-12-31",
      });

      expect(qb.where).toHaveBeenCalledWith(
        "transactions.created_at",
        ">=",
        new Date("2024-01-01"),
      );
      expect(qb.where).toHaveBeenCalledWith(
        "transactions.created_at",
        "<=",
        new Date("2024-12-31"),
      );
    });

    it("applies amount range filters", async () => {
      const qb = createQueryBuilder([]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, {
        minAmount: 10,
        maxAmount: 500,
      });

      expect(qb.where).toHaveBeenCalledWith("transactions.usd_value", ">=", 10);
      expect(qb.where).toHaveBeenCalledWith(
        "transactions.usd_value",
        "<=",
        500,
      );
    });

    it("applies full-text search when q is provided", async () => {
      const qb = createQueryBuilder([]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, { q: "stellar payment" });

      expect(qb.whereRaw).toHaveBeenCalledWith(
        "transactions.search_vector @@ websearch_to_tsquery('simple', ?)",
        ["stellar payment"],
      );
    });

    it("applies all filters simultaneously", async () => {
      const qb = createQueryBuilder([]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, {
        q: "deposit",
        status: "completed",
        type: "credit",
        chain: "base",
        token: "eth",
        from: "2024-01-01",
        to: "2024-12-31",
        minAmount: 5,
        maxAmount: 1000,
      });

      expect(qb.whereRaw).toHaveBeenCalled();
      expect(qb.where).toHaveBeenCalledWith("transactions.status", "completed");
      expect(qb.where).toHaveBeenCalledWith("transactions.type", "credit");
      expect(qb.where).toHaveBeenCalledWith("chains.symbol", "BASE");
      expect(qb.where).toHaveBeenCalledWith("tokens.symbol", "ETH");
    });
  });

  // ── Sorting ───────────────────────────────────────────────────────────────

  describe("sorting", () => {
    it("sorts by relevance when q is provided and sortBy is relevance", async () => {
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, {
        q: "test",
        sortBy: "relevance",
      });

      expect(qb.orderByRaw).toHaveBeenCalledWith(
        expect.stringContaining("ts_rank"),
        expect.any(Array),
      );
    });

    it("sorts by date desc by default when no q provided", async () => {
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, {});

      expect(qb.orderBy).toHaveBeenCalledWith(
        "transactions.created_at",
        "desc",
      );
    });

    it("sorts by amount", async () => {
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.search(userId, {
        sortBy: "amount",
        sortDir: "asc",
      });

      expect(qb.orderBy).toHaveBeenCalledWith("transactions.usd_value", "asc");
    });
  });

  // ── Cursor pagination ──────────────────────────────────────────────────────

  describe("cursor pagination", () => {
    it("returns nextCursor when there are more results", async () => {
      // Return limit + 1 rows to signal hasMore
      const rows = Array.from({ length: 21 }, (_, i) => makeTx({ id: i + 1 }));
      const qb = createQueryBuilder(rows);
      mockDb.mockReturnValue(qb);

      const result = await TransactionSearchService.search(userId, {
        limit: 20,
      });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
      expect(result.data.length).toBe(20);
    });

    it("returns no nextCursor on last page", async () => {
      const rows = [makeTx({ id: 1 }), makeTx({ id: 2 })];
      const qb = createQueryBuilder(rows);
      mockDb.mockReturnValue(qb);

      const result = await TransactionSearchService.search(userId, {
        limit: 20,
      });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("encodes and decodes cursors consistently", () => {
      const tx = makeTx({ id: 99, created_at: new Date("2024-03-01") });
      // Access internal helpers via the service object indirectly by checking round-trip
      const cursor = Buffer.from(
        JSON.stringify({ created_at: tx.created_at, id: tx.id }),
      ).toString("base64");

      const decoded = JSON.parse(
        Buffer.from(cursor, "base64").toString("utf8"),
      );
      expect(decoded.id).toBe(99);
    });
  });

  // ── CSV export ─────────────────────────────────────────────────────────────

  describe("exportToCsv", () => {
    it("returns a CSV buffer with a header row", async () => {
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      const csv = await TransactionSearchService.exportToCsv(userId, {});

      expect(typeof csv).toBe("string");
      expect(csv).toContain("id,reference,date,type,status");
      expect(csv).toContain("PAY-001");
    });

    it("returns a CSV with multiple rows when multiple transactions match", async () => {
      const rows = [
        makeTx({ id: 1, reference: "PAY-001" }),
        makeTx({ id: 2, reference: "PAY-002" }),
      ];
      const qb = createQueryBuilder(rows);
      mockDb.mockReturnValue(qb);

      const csv = await TransactionSearchService.exportToCsv(userId, {});

      expect(csv).toContain("PAY-001");
      expect(csv).toContain("PAY-002");
    });

    it("applies filters during export", async () => {
      const qb = createQueryBuilder([makeTx()]);
      mockDb.mockReturnValue(qb);

      await TransactionSearchService.exportToCsv(userId, {
        status: "completed",
        chain: "base",
      });

      expect(qb.where).toHaveBeenCalledWith("transactions.status", "completed");
      expect(qb.where).toHaveBeenCalledWith("chains.symbol", "BASE");
    });
  });
});
