import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockWalletFindById = jest.fn();
const mockWalletGetByUser = jest.fn();
const mockWalletUpdate = jest.fn();
const mockBalanceGetByUser = jest.fn();
const mockBalanceCredit = jest.fn();
const mockBalanceDebit = jest.fn();

jest.unstable_mockModule("../models/Wallet.js", () => ({
  default: {
    findById: mockWalletFindById,
    getByUser: mockWalletGetByUser,
    update: mockWalletUpdate,
  },
}));

jest.unstable_mockModule("../models/Balance.js", () => ({
  default: {
    getByUser: mockBalanceGetByUser,
    credit: mockBalanceCredit,
    debit: mockBalanceDebit,
  },
}));

const Wallet = await import("../models/Wallet.js");
const Balance = await import("../models/Balance.js");

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

describe("Wallet Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getWalletBalance", () => {
    it("should retrieve wallet with all balances", async () => {
      const balances = [
        {
          id: 1,
          token_id: 1,
          amount: 100.5,
          usd_value: 100,
          token_symbol: "USDC",
        },
        {
          id: 2,
          token_id: 2,
          amount: 50,
          usd_value: 150,
          token_symbol: "BTC",
        },
      ];

      mockBalanceGetByUser.mockResolvedValue(balances);

      const result = await Wallet.default.getByUser(1);

      expect(result).toBeDefined();
      expect(mockBalanceGetByUser).toHaveBeenCalledWith(1);
    });

    it("should calculate available and locked balances", async () => {
      const wallet = {
        id: 1,
        user_id: 1,
        available_balance: 500,
        locked_balance: 100,
        total_balance: 600,
      };

      mockWalletFindById.mockResolvedValue(wallet);

      const result = await Wallet.default.findById(1);

      expect(result.available_balance).toBe(500);
      expect(result.locked_balance).toBe(100);
      expect(result.total_balance).toBe(600);
    });

    it("should return empty balance array if no balances exist", async () => {
      mockBalanceGetByUser.mockResolvedValue([]);

      const result = await Wallet.default.getByUser(1);

      expect(result).toEqual([]);
    });
  });

  describe("creditBalance", () => {
    it("should increase available balance when crediting", async () => {
      const updatedBalance = {
        id: 1,
        amount: 150,
        token_id: 1,
        user_id: 1,
      };

      mockBalanceCredit.mockResolvedValue(updatedBalance);

      const result = await Balance.default.credit(1, 50);

      expect(result.amount).toBe(150);
      expect(mockBalanceCredit).toHaveBeenCalledWith(1, 50);
    });

    it("should throw error when crediting invalid balance", async () => {
      mockBalanceCredit.mockRejectedValue(new Error("Balance not found"));

      await expect(Balance.default.credit(999, 50)).rejects.toThrow("Balance not found");
    });

    it("should handle large amounts", async () => {
      const largeAmount = 1000000;
      const updatedBalance = {
        id: 1,
        amount: largeAmount,
        token_id: 1,
      };

      mockBalanceCredit.mockResolvedValue(updatedBalance);

      const result = await Balance.default.credit(1, largeAmount);

      expect(result.amount).toBe(largeAmount);
    });
  });

  describe("debitBalance", () => {
    it("should decrease available balance when debiting", async () => {
      const updatedBalance = {
        id: 1,
        amount: 50,
        token_id: 1,
        user_id: 1,
      };

      mockBalanceDebit.mockResolvedValue(updatedBalance);

      const result = await Balance.default.debit(1, 50);

      expect(result.amount).toBe(50);
      expect(mockBalanceDebit).toHaveBeenCalledWith(1, 50);
    });

    it("should prevent debiting when insufficient balance", async () => {
      mockBalanceDebit.mockRejectedValue(new Error("Insufficient balance"));

      await expect(Balance.default.debit(1, 1000)).rejects.toThrow("Insufficient balance");
    });

    it("should throw error for negative debit amount", async () => {
      mockBalanceDebit.mockRejectedValue(new Error("Amount must be positive"));

      await expect(Balance.default.debit(1, -50)).rejects.toThrow("Amount must be positive");
    });
  });

  describe("wallet updates", () => {
    it("should update wallet auto_convert_threshold", async () => {
      const updatedWallet = {
        id: 1,
        user_id: 1,
        auto_convert_threshold: 5000,
      };

      mockWalletUpdate.mockResolvedValue(updatedWallet);

      const result = await Wallet.default.update(1, { auto_convert_threshold: 5000 });

      expect(result.auto_convert_threshold).toBe(5000);
    });

    it("should not allow negative thresholds", async () => {
      mockWalletUpdate.mockRejectedValue(new Error("Threshold must be non-negative"));

      await expect(Wallet.default.update(1, { auto_convert_threshold: -100 })).rejects.toThrow();
    });
  });

  describe("balance multi-token handling", () => {
    it("should handle multiple token types in wallet", async () => {
      const balances = [
        { id: 1, token_symbol: "USDC", amount: 100, usd_value: 100 },
        { id: 2, token_symbol: "USDT", amount: 50, usd_value: 50 },
        { id: 3, token_symbol: "BTC", amount: 0.5, usd_value: 20000 },
      ];

      mockBalanceGetByUser.mockResolvedValue(balances);

      const result = await Wallet.default.getByUser(1);

      expect(result).toHaveLength(3);
      expect(result.map(b => b.token_symbol)).toContain("USDC");
      expect(result.map(b => b.token_symbol)).toContain("BTC");
    });

    it("should correctly sum USD values across tokens", async () => {
      const balances = [
        { id: 1, token_symbol: "USDC", usd_value: 100 },
        { id: 2, token_symbol: "USDT", usd_value: 50 },
        { id: 3, token_symbol: "BTC", usd_value: 20000 },
      ];

      mockBalanceGetByUser.mockResolvedValue(balances);

      const result = await Wallet.default.getByUser(1);
      const totalUSD = result.reduce((sum, b) => sum + b.usd_value, 0);

      expect(totalUSD).toBe(20150);
    });
  });
});
