import { jest } from "@jest/globals";
import OffRampService from "../../services/OffRampService.js";
import PaystackService from "../../services/PaystackService.js";
import MonnifyService from "../../services/MonnifyService.js";
import Withdrawal from "../../models/Withdrawal.js";
import Balance from "../../models/Balance.js";
import Token from "../../models/Token.js";
import BankAccount from "../../models/BankAccount.js";
import ExchangeRateService from "../../services/exchange-rate-api.js";
import db from "../../config/database.js";

// Mock dependencies
jest.mock("../../services/PaystackService.js");
jest.mock("../../services/MonnifyService.js");
jest.mock("../../models/Withdrawal.js");
jest.mock("../../models/Balance.js");
jest.mock("../../models/Token.js");
jest.mock("../../models/BankAccount.js");
jest.mock("../../services/exchange-rate-api.js");
jest.mock("../../config/database.js");

describe("OffRampService", () => {
  const mockUser = { id: 1, tag: "test-user" };
  const mockToken = { id: 1, symbol: "XLM", price: 0.1 };
  const mockBankAccount = { id: 1, user_id: 1, account_number: "1234567890", bank_code: "044" };
  const mockBalance = { id: 1, user_id: 1, amount: "1000" };
  const mockWithdrawal = { id: 100, user_id: 1, amount_crypto: 100, amount_fiat: 15000, status: "pending" };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    BankAccount.findById.mockResolvedValue(mockBankAccount);
    Token.findById.mockResolvedValue(mockToken);
    Balance.findByUserIdAndTokenId.mockResolvedValue(mockBalance);
    ExchangeRateService.getRates.mockResolvedValue({ NGN: 1600 });
    
    db.transaction.mockResolvedValue({
      commit: jest.fn(),
      rollback: jest.fn()
    });
    
    Withdrawal.create.mockResolvedValue(mockWithdrawal);
    Withdrawal.findById.mockResolvedValue(mockWithdrawal);
  });

  describe("initiateWithdrawal", () => {
    it("should successfully initiate a withdrawal", async () => {
      const params = { userId: 1, tokenId: 1, bankAccountId: 1, amountCrypto: 100 };
      
      const result = await OffRampService.initiateWithdrawal(params);
      
      expect(Withdrawal.create).toHaveBeenCalled();
      expect(Balance.debit).toHaveBeenCalledWith(mockBalance.id, 100, expect.anything());
      expect(result).toEqual(mockWithdrawal);
    });

    it("should throw error if balance is insufficient", async () => {
      Balance.findByUserIdAndTokenId.mockResolvedValue({ ...mockBalance, amount: "50" });
      
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
      Withdrawal.findByReference.mockResolvedValue(mockWithdrawal);
      
      await OffRampService.handleWebhook("paystack", "REF_PAY", "success");
      
      expect(Withdrawal.updateStatus).toHaveBeenCalledWith(mockWithdrawal.id, "completed", expect.any(String));
    });

    it("should fail and refund on failure webhook", async () => {
      Withdrawal.findByReference.mockResolvedValue(mockWithdrawal);
      Withdrawal.findById.mockResolvedValue(mockWithdrawal);
      Balance.findByUserIdAndTokenId.mockResolvedValue(mockBalance);
      
      await OffRampService.handleWebhook("paystack", "REF_PAY", "failed");
      
      expect(Withdrawal.updateStatus).toHaveBeenCalledWith(mockWithdrawal.id, "failed", expect.any(String), expect.anything());
      expect(Balance.credit).toHaveBeenCalled();
    });
  });
});
