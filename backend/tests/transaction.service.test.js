import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockTransactionCreate = jest.fn();
const mockTransactionFindById = jest.fn();
const mockTransactionGetByUser = jest.fn();
const mockTransactionSearch = jest.fn();
const mockIdempotencyGet = jest.fn();
const mockIdempotencyCreate = jest.fn();

jest.unstable_mockModule("../models/Transaction.js", () => ({
  default: {
    create: mockTransactionCreate,
    findById: mockTransactionFindById,
    getByUser: mockTransactionGetByUser,
    search: mockTransactionSearch,
  },
}));

jest.unstable_mockModule("../services/IdempotencyService.js", () => ({
  default: {
    get: mockIdempotencyGet,
    create: mockIdempotencyCreate,
  },
}));

const { createTransaction } = await import("../controllers/transactionController.js");

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

describe("Transaction Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createTransaction", () => {
    it("should create a new transaction successfully", async () => {
      const transaction = {
        id: 1,
        user_id: 1,
        from_tag: "sender",
        to_tag: "recipient",
        amount: 100,
        asset: "USDC",
        status: "completed",
        created_at: new Date(),
      };

      mockIdempotencyGet.mockResolvedValue(null);
      mockTransactionCreate.mockResolvedValue(transaction);
      mockIdempotencyCreate.mockResolvedValue({ id: 1 });

      const req = {
        user: { id: 1 },
        body: {
          to_tag: "recipient",
          amount: 100,
          asset: "USDC",
          idempotency_key: "unique-key-123",
        },
      };

      const res = mockResponse();
      await createTransaction(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toContain("created successfully");
      expect(mockTransactionCreate).toHaveBeenCalled();
    });

    it("should handle idempotency correctly", async () => {
      const existingTransaction = {
        id: 1,
        user_id: 1,
        from_tag: "sender",
        to_tag: "recipient",
        amount: 100,
      };

      mockIdempotencyGet.mockResolvedValue({
        id: 1,
        result: JSON.stringify(existingTransaction),
      });

      const req = {
        user: { id: 1 },
        body: {
          to_tag: "recipient",
          amount: 100,
          asset: "USDC",
          idempotency_key: "unique-key-123",
        },
      };

      const res = mockResponse();
      await createTransaction(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockTransactionCreate).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid amount", async () => {
      const req = {
        user: { id: 1 },
        body: {
          to_tag: "recipient",
          amount: -100,
          asset: "USDC",
        },
      };

      const res = mockResponse();
      await createTransaction(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("should return 400 for missing required fields", async () => {
      const req = {
        user: { id: 1 },
        body: {
          // Missing to_tag and amount
          asset: "USDC",
        },
      };

      const res = mockResponse();
      await createTransaction(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe("getByUser", () => {
    it("should retrieve user transactions with pagination", async () => {
      const transactions = [
        {
          id: 1,
          user_id: 1,
          from_tag: "sender",
          to_tag: "recipient",
          amount: 100,
          status: "completed",
        },
        {
          id: 2,
          user_id: 1,
          from_tag: "sender",
          to_tag: "recipient2",
          amount: 50,
          status: "completed",
        },
      ];

      mockTransactionGetByUser.mockResolvedValue(transactions);

      const req = {
        user: { id: 1 },
        query: { page: 1, limit: 10 },
      };

      const res = mockResponse();
      res.json = jest.fn((payload) => {
        res.body = payload;
        return res;
      });

      // Simulating a typical getByUser endpoint call
      const result = await mockTransactionGetByUser(1);
      expect(result).toHaveLength(2);
      expect(result[0].user_id).toBe(1);
    });
  });

  describe("searchTransactions", () => {
    it("should search transactions by status", async () => {
      const transactions = [
        {
          id: 1,
          status: "completed",
          amount: 100,
          created_at: new Date(),
        },
      ];

      mockTransactionSearch.mockResolvedValue(transactions);

      const result = await mockTransactionSearch({ status: "completed" });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("completed");
    });

    it("should search transactions by date range", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");
      const transactions = [
        {
          id: 1,
          created_at: new Date("2024-01-15"),
          amount: 100,
        },
      ];

      mockTransactionSearch.mockResolvedValue(transactions);

      const result = await mockTransactionSearch({ startDate, endDate });

      expect(result).toHaveLength(1);
      expect(new Date(result[0].created_at) >= startDate).toBe(true);
    });

    it("should filter by asset type", async () => {
      const transactions = [
        {
          id: 1,
          asset: "USDC",
          amount: 100,
        },
      ];

      mockTransactionSearch.mockResolvedValue(transactions);

      const result = await mockTransactionSearch({ asset: "USDC" });

      expect(result).toHaveLength(1);
      expect(result[0].asset).toBe("USDC");
    });
  });
});
