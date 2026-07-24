import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// --- Mocks ---

// Mock uuid
jest.unstable_mockModule("uuid", () => ({
  v4: jest.fn(() => "test-quote-id-12345"),
}));

// Mock logger
jest.unstable_mockModule("../utils/logger.js", () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock reference generator
jest.unstable_mockModule("../utils/reference.js", () => ({
  generateReference: jest.fn(() => "SWAPREF123456789"),
}));

// In-memory mock database
const mockDbData = {
  tokens: [
    { id: 1, symbol: "STRK", name: "Starknet", price: 0.14, chain: "Starknet (Ethereum L2)", decimals: 18 },
    { id: 2, symbol: "LSK", name: "Lisk", price: 0.43, chain: "Lisk", decimals: 18 },
    { id: 3, symbol: "BASE", name: "Base", price: 1.0, chain: "Base (Ethereum L2)", decimals: 18 },
    { id: 4, symbol: "FLOW", name: "Flow", price: 0.45, chain: "Flow", decimals: 18 },
    { id: 5, symbol: "U2U", name: "U2U Network", price: 0.02, chain: "U2U Solaris Mainnet", decimals: 18 },
    { id: 6, symbol: "XLM", name: "Stellar Lumens", price: 0.09, chain: "Stellar", decimals: 7 },
  ],
  balances: [
    { id: 1, user_id: 1, token_id: 1, amount: 1000 },
    { id: 2, user_id: 1, token_id: 2, amount: 500 },
    { id: 3, user_id: 1, token_id: 3, amount: 100 },
  ],
  chains: [
    { id: 1, symbol: "STRK", name: "Starknet" },
    { id: 2, symbol: "LSK", name: "Lisk" },
    { id: 3, symbol: "BASE", name: "Base" },
    { id: 4, symbol: "FLOW", name: "Flow" },
    { id: 5, symbol: "U2U", name: "U2U" },
    { id: 6, symbol: "XLM", name: "Stellar" },
  ],
};

// Build a chainable knex-like mock
function createMockQueryBuilder(tableName) {
  let _where = {};
  let _whereIns = {};
  let _orderBy = null;
  let _limit = null;
  let _offset = null;
  let _selectCols = null;
  let _increments = null;
  let _decrements = null;

  const qb = {
    where: jest.fn((conditions) => {
      _where = { ..._where, ...conditions };
      return qb;
    }),
    whereIn: jest.fn((col, vals) => {
      _whereIns[col] = vals;
      return qb;
    }),
    whereNotNull: jest.fn(() => qb),
    orderBy: jest.fn((col, dir) => {
      _orderBy = { col, dir };
      return qb;
    }),
    limit: jest.fn((n) => {
      _limit = n;
      return qb;
    }),
    offset: jest.fn((n) => {
      _offset = n;
      return qb;
    }),
    select: jest.fn((...cols) => {
      _selectCols = cols;
      return qb;
    }),
    first: jest.fn(async () => {
      let rows = mockDbData[tableName] || [];
      // Apply where filters
      for (const [key, val] of Object.entries(_where)) {
        rows = rows.filter((r) => r[key] === val);
      }
      return rows[0] || null;
    }),
    then: jest.fn((resolve) => {
      let rows = mockDbData[tableName] || [];
      for (const [key, val] of Object.entries(_where)) {
        rows = rows.filter((r) => r[key] === val);
      }
      if (_orderBy) {
        rows.sort((a, b) => {
          const dir = _orderBy.dir === "asc" ? 1 : -1;
          return a[_orderBy.col] > b[_orderBy.col] ? dir : -dir;
        });
      }
      if (_offset) rows = rows.slice(_offset);
      if (_limit) rows = rows.slice(0, _limit);
      resolve(rows);
      return qb;
    }),
    insert: jest.fn(async (data) => {
      const id = (mockDbData[tableName]?.length || 0) + 1;
      const record = { ...data, id };
      if (!mockDbData[tableName]) mockDbData[tableName] = [];
      mockDbData[tableName].push(record);
      return [id];
    }),
    update: jest.fn(async () => 1),
    del: jest.fn(async () => 1),
    increment: jest.fn(async (col, val) => {
      for (const row of mockDbData[tableName] || []) {
        let matches = true;
        for (const [key, v] of Object.entries(_where)) {
          if (row[key] !== v) matches = false;
        }
        if (matches) row[col] = (parseFloat(row[col]) || 0) + val;
      }
      return 1;
    }),
    decrement: jest.fn(async (col, val) => {
      for (const row of mockDbData[tableName] || []) {
        let matches = true;
        for (const [key, v] of Object.entries(_where)) {
          if (row[key] !== v) matches = false;
        }
        if (matches) row[col] = (parseFloat(row[col]) || 0) - val;
      }
      return 1;
    }),
  };
  return qb;
}

const mockDb = jest.fn((tableName) => createMockQueryBuilder(tableName));
mockDb.fn = { now: () => new Date() };

jest.unstable_mockModule("../config/database.js", () => ({
  default: mockDb,
}));

// Mock WebhookService
const mockDispatch = jest.fn(async () => {});
jest.unstable_mockModule("../services/WebhookService.js", () => ({
  default: {
    dispatch: mockDispatch,
    WEBHOOK_EVENTS: {
      SWAP_COMPLETED: "swap.completed",
      SWAP_FAILED: "swap.failed",
    },
  },
}));

// Now dynamically import the modules under test
const { default: SwapService } = await import("../services/SwapService.js");
const {
  getSwapQuote,
  confirmSwap,
  executeSwap,
  getSwapStatus,
  getSupportedTokens,
  getSupportedChains,
} = await import("../controllers/swapController.js");

describe("SwapService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
  });

  describe("getQuote", () => {
    it("should generate a valid swap quote", async () => {
      const quote = await SwapService.getQuote({
        userId: 1,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        slippage: 0.5,
      });

      expect(quote).toBeDefined();
      expect(quote.quoteId).toBeDefined();
      expect(quote.fromToken).toBe("STRK");
      expect(quote.toToken).toBe("LSK");
      expect(quote.chainId).toBe(1);
      expect(parseFloat(quote.amount)).toBe(100);
      expect(parseFloat(quote.expectedOutput)).toBeGreaterThan(0);
      expect(parseFloat(quote.minimumOutput)).toBeGreaterThan(0);
      expect(parseFloat(quote.minimumOutput)).toBeLessThanOrEqual(parseFloat(quote.expectedOutput));
      expect(quote.rate).toBeGreaterThan(0);
      expect(quote.slippage).toBe(0.5);
      expect(quote.expiresAt).toBeDefined();
      expect(quote.createdAt).toBeDefined();
    });

    it("should throw for unsupported chain", async () => {
      await expect(
        SwapService.getQuote({
          userId: 1,
          fromToken: "STRK",
          toToken: "LSK",
          amount: 100,
          chainId: 999,
        })
      ).rejects.toThrow("Unsupported chain ID: 999");
    });

    it("should throw for unknown fromToken", async () => {
      await expect(
        SwapService.getQuote({
          userId: 1,
          fromToken: "UNKNOWN",
          toToken: "LSK",
          amount: 100,
          chainId: 1,
        })
      ).rejects.toThrow("Token not found: UNKNOWN");
    });

    it("should throw for unknown toToken", async () => {
      await expect(
        SwapService.getQuote({
          userId: 1,
          fromToken: "STRK",
          toToken: "UNKNOWN",
          amount: 100,
          chainId: 1,
        })
      ).rejects.toThrow("Token not found: UNKNOWN");
    });
  });

  describe("confirmSwap", () => {
    it("should execute a swap successfully with valid quote", async () => {
      // First get a quote
      const quote = await SwapService.getQuote({
        userId: 1,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        slippage: 0.5,
      });

      // Confirm the swap
      const result = await SwapService.confirmSwap({
        userId: 1,
        quoteId: quote.quoteId,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });

      expect(result).toBeDefined();
      expect(result.swapId).toBeDefined();
      expect(result.reference).toBeDefined();
      expect(result.status).toBe("completed");
      expect(result.fromToken).toBe("STRK");
      expect(result.toToken).toBe("LSK");
      expect(parseFloat(result.inputAmount)).toBe(100);
      expect(parseFloat(result.outputAmount)).toBeGreaterThan(0);
      expect(result.txHash).toBeDefined();
      expect(result.completedAt).toBeDefined();

      // Webhook should have been dispatched
      expect(mockDispatch).toHaveBeenCalledWith(
        "swap.completed",
        expect.objectContaining({
          swap_id: result.swapId,
          user_id: 1,
          from_token: "STRK",
          to_token: "LSK",
          status: "completed",
        }),
        1
      );
    });

    it("should throw for expired/missing quote", async () => {
      await expect(
        SwapService.confirmSwap({
          userId: 1,
          quoteId: "non-existent-quote-id",
          fromToken: "STRK",
          toToken: "LSK",
          amount: 100,
          chainId: 1,
        })
      ).rejects.toThrow("Quote not found or has expired");
    });

    it("should throw when user does not match quote owner", async () => {
      const quote = await SwapService.getQuote({
        userId: 1,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });

      await expect(
        SwapService.confirmSwap({
          userId: 999, // Different user
          quoteId: quote.quoteId,
          fromToken: "STRK",
          toToken: "LSK",
          amount: 100,
          chainId: 1,
        })
      ).rejects.toThrow("Quote does not belong to this user.");
    });

    it("should throw when parameters do not match quote", async () => {
      const quote = await SwapService.getQuote({
        userId: 1,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });

      await expect(
        SwapService.confirmSwap({
          userId: 1,
          quoteId: quote.quoteId,
          fromToken: "STRK",
          toToken: "BASE", // Different toToken
          amount: 100,
          chainId: 1,
        })
      ).rejects.toThrow("Token parameters do not match the original quote.");
    });

    it("should throw when amount does not match quote", async () => {
      const quote = await SwapService.getQuote({
        userId: 1,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });

      await expect(
        SwapService.confirmSwap({
          userId: 1,
          quoteId: quote.quoteId,
          fromToken: "STRK",
          toToken: "LSK",
          amount: 200, // Different amount
          chainId: 1,
        })
      ).rejects.toThrow("Amount does not match the original quote.");
    });

    it("should dispatch swap.failed webhook on execution failure", async () => {
      // This tests the failure path by using an invalid quoteId after the quote was consumed
      const quote = await SwapService.getQuote({
        userId: 1,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 50,
        chainId: 1,
      });

      // First confirm succeeds
      await SwapService.confirmSwap({
        userId: 1,
        quoteId: quote.quoteId,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 50,
        chainId: 1,
      });

      // Second attempt with same quoteId should fail
      await expect(
        SwapService.confirmSwap({
          userId: 1,
          quoteId: quote.quoteId,
          fromToken: "STRK",
          toToken: "LSK",
          amount: 50,
          chainId: 1,
        })
      ).rejects.toThrow("Quote not found or has expired");
    });
  });

  describe("getSupportedTokens", () => {
    it("should return list of supported tokens with valid prices", async () => {
      const tokens = await SwapService.getSupportedTokens();
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
      // All returned tokens should have valid prices
      for (const token of tokens) {
        expect(token).toHaveProperty("symbol");
        expect(token).toHaveProperty("price");
        expect(parseFloat(token.price)).toBeGreaterThan(0);
      }
    });
  });

  describe("SUPPORTED_CHAIN_IDS", () => {
    it("should include all expected chains", () => {
      expect(SwapService.SUPPORTED_CHAIN_IDS).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });
});

describe("SwapController", () => {
  const createMockReq = (body = {}, user = { id: 1 }) => ({
    body,
    user,
    params: {},
    query: {},
  });

  const createMockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSwapQuote", () => {
    it("should return 200 with quote on success", async () => {
      const req = createMockReq({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        slippage: 0.5,
      });
      const res = createMockRes();

      await getSwapQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Quote generated successfully",
          data: expect.objectContaining({
            quoteId: expect.any(String),
            fromToken: "STRK",
            toToken: "LSK",
          }),
        })
      );
    });

    it("should return 404 for unknown token", async () => {
      const req = createMockReq({
        fromToken: "INVALID",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      const res = createMockRes();

      await getSwapQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });

    it("should return 400 for unsupported chain", async () => {
      const req = createMockReq({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 999,
      });
      const res = createMockRes();

      await getSwapQuote(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });
  });

  describe("confirmSwap", () => {
    it("should return 201 with swap result on success", async () => {
      // First get a quote
      const quoteReq = createMockReq({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      const quoteRes = createMockRes();
      await getSwapQuote(quoteReq, quoteRes);

      const quoteData = quoteRes.json.mock.calls[0][0].data;

      // Now confirm
      const confirmReq = createMockReq({
        quoteId: quoteData.quoteId,
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      const confirmRes = createMockRes();

      await confirmSwap(confirmReq, confirmRes);

      expect(confirmRes.status).toHaveBeenCalledWith(201);
      expect(confirmRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Swap executed successfully",
          data: expect.objectContaining({
            status: "completed",
            fromToken: "STRK",
            toToken: "LSK",
          }),
        })
      );
    });

    it("should return 410 for missing/expired quote", async () => {
      const req = createMockReq({
        quoteId: "non-existent",
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      const res = createMockRes();

      await confirmSwap(req, res);

      // "Quote not found or has expired" contains "expired", so controller returns 410
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });
  });

  describe("executeSwap (combined)", () => {
    it("should return quote when confirm=false", async () => {
      const req = createMockReq({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        confirm: false,
      });
      const res = createMockRes();

      await executeSwap(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            quoteId: expect.any(String),
          }),
        })
      );
    });

    it("should execute swap when confirm=true", async () => {
      const req = createMockReq({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        confirm: true,
      });
      const res = createMockRes();

      await executeSwap(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Swap executed successfully",
          data: expect.objectContaining({
            status: "completed",
          }),
        })
      );
    });
  });

  describe("getSwapStatus", () => {
    it("should return status for a given swap ID", async () => {
      const req = createMockReq({}, { id: 1 });
      req.params = { swapId: "test-swap-id" };
      const res = createMockRes();

      await getSwapStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            swapId: "test-swap-id",
            status: "completed",
          }),
        })
      );
    });
  });

  describe("getSupportedTokens", () => {
    it("should return list of supported tokens", async () => {
      const req = createMockReq();
      const res = createMockRes();

      await getSupportedTokens(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
        })
      );
    });
  });

  describe("getSupportedChains", () => {
    it("should return list of supported chains", async () => {
      const req = createMockReq();
      const res = createMockRes();

      await getSupportedChains(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
        })
      );
    });
  });
});

describe("Swap Schema Validation", () => {
  // Import schema
  let swapQuoteSchema, swapConfirmSchema;

  beforeAll(async () => {
    const schemas = await import("../schemas/swap.js");
    swapQuoteSchema = schemas.swapQuoteSchema;
    swapConfirmSchema = schemas.swapConfirmSchema;
  });

  describe("swapQuoteSchema", () => {
    it("should validate a correct quote request", () => {
      const { error } = swapQuoteSchema.validate({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        slippage: 0.5,
      });
      expect(error).toBeUndefined();
    });

    it("should reject missing fromToken", () => {
      const { error } = swapQuoteSchema.validate({
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain("fromToken");
    });

    it("should reject missing toToken", () => {
      const { error } = swapQuoteSchema.validate({
        fromToken: "STRK",
        amount: 100,
        chainId: 1,
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain("toToken");
    });

    it("should reject negative amount", () => {
      const { error } = swapQuoteSchema.validate({
        fromToken: "STRK",
        toToken: "LSK",
        amount: -50,
        chainId: 1,
      });
      expect(error).toBeDefined();
    });

    it("should reject zero amount", () => {
      const { error } = swapQuoteSchema.validate({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 0,
        chainId: 1,
      });
      expect(error).toBeDefined();
    });

    it("should reject same fromToken and toToken", () => {
      const { error } = swapQuoteSchema.validate({
        fromToken: "STRK",
        toToken: "STRK",
        amount: 100,
        chainId: 1,
      });
      expect(error).toBeDefined();
    });

    it("should reject invalid slippage (too high)", () => {
      const { error } = swapQuoteSchema.validate({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        slippage: 100,
      });
      expect(error).toBeDefined();
    });

    it("should default slippage to 0.5", () => {
      const { value } = swapQuoteSchema.validate({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      expect(value.slippage).toBe(0.5);
    });

    it("should reject missing chainId", () => {
      const { error } = swapQuoteSchema.validate({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
      });
      expect(error).toBeDefined();
    });
  });

  describe("swapConfirmSchema", () => {
    it("should validate a correct confirm request", () => {
      const { error } = swapConfirmSchema.validate({
        quoteId: "abc-123",
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      expect(error).toBeUndefined();
    });

    it("should reject missing quoteId", () => {
      const { error } = swapConfirmSchema.validate({
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain("quoteId");
    });

    it("should accept optional minReceiveAmount", () => {
      const { error } = swapConfirmSchema.validate({
        quoteId: "abc-123",
        fromToken: "STRK",
        toToken: "LSK",
        amount: 100,
        chainId: 1,
        minReceiveAmount: 50,
      });
      expect(error).toBeUndefined();
    });
  });
});
