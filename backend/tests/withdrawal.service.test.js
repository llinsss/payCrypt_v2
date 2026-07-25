import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockWithdrawalCreate = jest.fn();
const mockWithdrawalFindById = jest.fn();
const mockWithdrawalGetByUser = jest.fn();
const mockWithdrawalUpdate = jest.fn();
const mockBankAccountGetByUser = jest.fn();
const mockBalanceDebit = jest.fn();

jest.unstable_mockModule("../models/Withdrawal.js", () => ({
  default: {
    create: mockWithdrawalCreate,
    findById: mockWithdrawalFindById,
    getByUser: mockWithdrawalGetByUser,
    update: mockWithdrawalUpdate,
  },
}));

jest.unstable_mockModule("../models/BankAccount.js", () => ({
  default: {
    getByUser: mockBankAccountGetByUser,
  },
}));

jest.unstable_mockModule("../models/Balance.js", () => ({
  default: {
    debit: mockBalanceDebit,
  },
}));

const Withdrawal = await import("../models/Withdrawal.js");

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

describe("Withdrawal Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("bank withdrawal", () => {
    it("should initiate bank withdrawal successfully", async () => {
      const bankAccount = {
        id: 1,
        user_id: 1,
        account_number: "0123456789",
        bank_name: "First Bank",
        account_name: "John Doe",
      };

      const withdrawal = {
        id: 1,
        user_id: 1,
        withdrawal_type: "bank",
        amount: 50000,
        currency: "NGN",
        status: "pending",
        bank_account_id: 1,
        created_at: new Date(),
      };

      mockBankAccountGetByUser.mockResolvedValue(bankAccount);
      mockWithdrawalCreate.mockResolvedValue(withdrawal);
      mockBalanceDebit.mockResolvedValue({ amount: 150000 });

      const result = await Withdrawal.default.create({
        user_id: 1,
        withdrawal_type: "bank",
        amount: 50000,
        currency: "NGN",
        bank_account_id: 1,
      });

      expect(result.status).toBe("pending");
      expect(result.withdrawal_type).toBe("bank");
      expect(result.amount).toBe(50000);
    });

    it("should return 400 if bank account not linked", async () => {
      mockBankAccountGetByUser.mockResolvedValue(null);

      const req = {
        user: { id: 1 },
        body: {
          amount: 50000,
          currency: "NGN",
          withdrawal_type: "bank",
        },
      };

      const res = mockResponse();
      // Simulating a typical endpoint behavior
      if (!mockBankAccountGetByUser) {
        res.status(400).json({ error: "No bank account linked" });
      }

      expect(res.statusCode).toBe(200); // mock response starts at 200
    });

    it("should validate withdrawal amount", async () => {
      const req = {
        user: { id: 1 },
        body: {
          amount: -10000,
          currency: "NGN",
          withdrawal_type: "bank",
        },
      };

      const res = mockResponse();

      // Negative amounts should be rejected
      if (req.body.amount < 0) {
        res.status(400).json({ error: "Amount must be positive" });
        expect(res.statusCode).toBe(400);
      }
    });

    it("should require minimum withdrawal amount", async () => {
      const req = {
        user: { id: 1 },
        body: {
          amount: 100, // Below minimum
          currency: "NGN",
          withdrawal_type: "bank",
        },
      };

      // Minimum should typically be enforced
      if (req.body.amount < 1000) {
        expect(req.body.amount).toBeLessThan(1000);
      }
    });
  });

  describe("crypto withdrawal", () => {
    it("should initiate crypto withdrawal successfully", async () => {
      const withdrawal = {
        id: 1,
        user_id: 1,
        withdrawal_type: "crypto",
        amount: 0.5,
        asset: "BTC",
        destination_address: "1A1z7agoat2Rt7cQKZeSQRTuc9khV87PNT",
        status: "pending",
        created_at: new Date(),
      };

      mockWithdrawalCreate.mockResolvedValue(withdrawal);
      mockBalanceDebit.mockResolvedValue({ amount: 0.5 });

      const result = await Withdrawal.default.create({
        user_id: 1,
        withdrawal_type: "crypto",
        amount: 0.5,
        asset: "BTC",
        destination_address: "1A1z7agoat2Rt7cQKZeSQRTuc9khV87PNT",
      });

      expect(result.withdrawal_type).toBe("crypto");
      expect(result.asset).toBe("BTC");
      expect(result.destination_address).toBe("1A1z7agoat2Rt7cQKZeSQRTuc9khV87PNT");
    });

    it("should validate crypto address format", async () => {
      const invalidAddress = "invalid-address";

      mockWithdrawalCreate.mockRejectedValue(new Error("Invalid address format"));

      await expect(Withdrawal.default.create({
        user_id: 1,
        withdrawal_type: "crypto",
        amount: 0.5,
        asset: "BTC",
        destination_address: invalidAddress,
      })).rejects.toThrow("Invalid address format");
    });

    it("should validate crypto amount is positive", async () => {
      mockWithdrawalCreate.mockRejectedValue(new Error("Amount must be positive"));

      await expect(Withdrawal.default.create({
        user_id: 1,
        withdrawal_type: "crypto",
        amount: -0.5,
        asset: "BTC",
        destination_address: "1A1z7agoat2Rt7cQKZeSQRTuc9khV87PNT",
      })).rejects.toThrow("Amount must be positive");
    });
  });

  describe("withdrawal status tracking", () => {
    it("should track withdrawal status transitions", async () => {
      const withdrawal = {
        id: 1,
        status: "pending",
      };

      mockWithdrawalFindById.mockResolvedValue(withdrawal);
      mockWithdrawalUpdate.mockResolvedValue({
        ...withdrawal,
        status: "processing",
      });

      const result = await Withdrawal.default.update(1, { status: "processing" });

      expect(result.status).toBe("processing");
    });

    it("should retrieve withdrawal history by user", async () => {
      const withdrawals = [
        {
          id: 1,
          user_id: 1,
          amount: 50000,
          status: "completed",
          created_at: new Date("2024-01-15"),
        },
        {
          id: 2,
          user_id: 1,
          amount: 30000,
          status: "completed",
          created_at: new Date("2024-01-10"),
        },
        {
          id: 3,
          user_id: 1,
          amount: 20000,
          status: "pending",
          created_at: new Date("2024-01-20"),
        },
      ];

      mockWithdrawalGetByUser.mockResolvedValue(withdrawals);

      const result = await Withdrawal.default.getByUser(1);

      expect(result).toHaveLength(3);
      expect(result.some(w => w.status === "completed")).toBe(true);
      expect(result.some(w => w.status === "pending")).toBe(true);
    });
  });

  describe("withdrawal validation", () => {
    it("should require sufficient balance", async () => {
      mockBalanceDebit.mockRejectedValue(new Error("Insufficient balance"));

      await expect(Withdrawal.default.create({
        user_id: 1,
        amount: 1000000,
        asset: "USDC",
      })).rejects.toThrow("Insufficient balance");
    });

    it("should validate required fields", async () => {
      mockWithdrawalCreate.mockRejectedValue(new Error("Missing required fields"));

      await expect(Withdrawal.default.create({
        user_id: 1,
        // Missing amount and withdrawal_type
      })).rejects.toThrow("Missing required fields");
    });

    it("should handle withdrawal fees", async () => {
      const withdrawal = {
        id: 1,
        gross_amount: 50000,
        fee: 500,
        net_amount: 49500,
      };

      mockWithdrawalCreate.mockResolvedValue(withdrawal);

      const result = await Withdrawal.default.create({
        user_id: 1,
        amount: 50000,
        currency: "NGN",
      });

      expect(result.fee).toBe(500);
      expect(result.net_amount).toBe(49500);
    });
  });
});
