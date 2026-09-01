import { jest } from "@jest/globals";

const mockPaystack = {
  createTransferRecipient: jest.fn(),
  initiateTransfer: jest.fn(),
};
const mockMonnify = {
  initiateDisbursement: jest.fn(),
};
const mockWithdrawal = {
  create: jest.fn(),
  findById: jest.fn(),
  findByReference: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
};
const mockBalance = {
  findByUserIdAndTokenId: jest.fn(),
  debit: jest.fn(),
  credit: jest.fn(),
};
const mockToken = { findById: jest.fn() };
const mockBankAccount = { findById: jest.fn() };
const mockExchangeRate = { getRates: jest.fn() };
const mockTrx = { commit: jest.fn(), rollback: jest.fn() };
const mockDb = { transaction: jest.fn(async () => mockTrx) };
const mockPublish = jest.fn();

jest.unstable_mockModule("../../services/PaystackService.js", () => ({ default: mockPaystack }));
jest.unstable_mockModule("../../services/MonnifyService.js", () => ({ default: mockMonnify }));
jest.unstable_mockModule("../../models/Withdrawal.js", () => ({ default: mockWithdrawal }));
jest.unstable_mockModule("../../models/Balance.js", () => ({ default: mockBalance }));
jest.unstable_mockModule("../../models/Token.js", () => ({ default: mockToken }));
jest.unstable_mockModule("../../models/BankAccount.js", () => ({ default: mockBankAccount }));
jest.unstable_mockModule("../../services/exchange-rate-api.js", () => ({ default: mockExchangeRate }));
jest.unstable_mockModule("../../config/database.js", () => ({ default: mockDb }));
jest.unstable_mockModule("../../config/redis.js", () => ({
  publish: mockPublish,
  default: {},
  redisConnection: null,
  subClient: {},
}));
jest.unstable_mockModule("../../services/NotificationService.js", () => ({
  default: { sendToUser: jest.fn(() => Promise.resolve()) },
}));

const { default: OffRampService } = await import("../../services/OffRampService.js");
const { default: PaystackService } = await import("../../services/PaystackService.js");
const { default: MonnifyService } = await import("../../services/MonnifyService.js");
const { default: Withdrawal } = await import("../../models/Withdrawal.js");
const { default: Balance } = await import("../../models/Balance.js");
const { default: Token } = await import("../../models/Token.js");
const { default: BankAccount } = await import("../../models/BankAccount.js");
const { default: ExchangeRateService } = await import("../../services/exchange-rate-api.js");

describe("OffRampService", () => {
  const mockTokenData = { id: 1, symbol: "XLM", price: 0.1 };
  const mockBankAccountData = { id: 1, user_id: 1, account_number: "1234567890", bank_code: "044" };
  const mockBalanceData = { id: 1, user_id: 1, amount: "1000" };
  const mockWithdrawalData = { id: 100, user_id: 1, token_id: 1, amount_crypto: 100, amount_fiat: 15000, status: "pending" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrx.commit.mockResolvedValue(undefined);
    mockTrx.rollback.mockResolvedValue(undefined);
    BankAccount.findById.mockResolvedValue(mockBankAccountData);
    Token.findById.mockResolvedValue(mockTokenData);
    Balance.findByUserIdAndTokenId.mockResolvedValue(mockBalanceData);
    Balance.debit.mockResolvedValue({});
    Balance.credit.mockResolvedValue({});
    ExchangeRateService.getRates.mockResolvedValue({ NGN: 1600 });
    Withdrawal.create.mockResolvedValue(mockWithdrawalData);
    Withdrawal.findById.mockResolvedValue(mockWithdrawalData);
    Withdrawal.update.mockResolvedValue(mockWithdrawalData);
    Withdrawal.updateStatus.mockResolvedValue(mockWithdrawalData);
  });

  describe("initiateWithdrawal", () => {
    it("should successfully initiate a withdrawal", async () => {
      const params = { userId: 1, tokenId: 1, bankAccountId: 1, amountCrypto: 100 };
      const result = await OffRampService.initiateWithdrawal(params);
      expect(Withdrawal.create).toHaveBeenCalled();
      expect(Balance.debit).toHaveBeenCalledWith(mockBalanceData.id, 100, expect.anything());
      expect(result).toEqual(mockWithdrawalData);
    });

    it("should throw error if balance is insufficient", async () => {
      Balance.findByUserIdAndTokenId.mockResolvedValue({ ...mockBalanceData, amount: "50" });
      const params = { userId: 1, tokenId: 1, bankAccountId: 1, amountCrypto: 100 };
      await expect(OffRampService.initiateWithdrawal(params)).rejects.toThrow("Insufficient balance");
    });
  });

  describe("_processTransfer", () => {
    it("should use Paystack by default", async () => {
      PaystackService.createTransferRecipient.mockResolvedValue("RCP_123");
      PaystackService.initiateTransfer.mockResolvedValue({ reference: "REF_PAY", transfer_code: "TRF_123", status: "success" });
      await OffRampService._processTransfer(100);
      expect(PaystackService.initiateTransfer).toHaveBeenCalled();
      expect(Withdrawal.update).toHaveBeenCalledWith(100, expect.objectContaining({ provider: "paystack" }));
    });

    it("should fallback to Monnify if Paystack fails", async () => {
      PaystackService.createTransferRecipient.mockRejectedValue(new Error("Paystack Down"));
      MonnifyService.initiateDisbursement.mockResolvedValue({ reference: "REF_MON", status: "SUCCESSFUL" });
      await OffRampService._processTransfer(100);
      expect(MonnifyService.initiateDisbursement).toHaveBeenCalled();
      expect(Withdrawal.update).toHaveBeenCalledWith(100, expect.objectContaining({ provider: "monnify" }));
    });
  });

  describe("handleWebhook", () => {
    it("should complete withdrawal on success webhook", async () => {
      Withdrawal.findByReference.mockResolvedValue(mockWithdrawalData);
      await OffRampService.handleWebhook("paystack", "REF_PAY", "success");
      expect(Withdrawal.updateStatus).toHaveBeenCalledWith(mockWithdrawalData.id, "completed", expect.any(String));
    });

    it("should fail and refund on failure webhook", async () => {
      Withdrawal.findByReference.mockResolvedValue(mockWithdrawalData);
      Withdrawal.findById.mockResolvedValue(mockWithdrawalData);
      Balance.findByUserIdAndTokenId.mockResolvedValue(mockBalanceData);
      await OffRampService.handleWebhook("paystack", "REF_PAY", "failed");
      expect(Withdrawal.updateStatus).toHaveBeenCalledWith(mockWithdrawalData.id, "failed", expect.any(String), expect.anything());
      expect(Balance.credit).toHaveBeenCalled();
    });
  });
});
