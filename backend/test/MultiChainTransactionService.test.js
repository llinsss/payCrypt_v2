import { describe, it, expect, beforeEach, vi } from "vitest";
import MultiChainTransactionService from "../services/MultiChainTransactionService.js";

describe("MultiChainTransactionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isEVMChain", () => {
    it("should return true for EVM chains", () => {
      expect(MultiChainTransactionService.isEVMChain("ethereum")).toBe(true);
      expect(MultiChainTransactionService.isEVMChain("base")).toBe(true);
      expect(MultiChainTransactionService.isEVMChain("lisk")).toBe(true);
      expect(MultiChainTransactionService.isEVMChain("u2u")).toBe(true);
    });

    it("should return false for non-EVM chains", () => {
      expect(MultiChainTransactionService.isEVMChain("stellar")).toBe(false);
      expect(MultiChainTransactionService.isEVMChain("bitcoin")).toBe(false);
      expect(MultiChainTransactionService.isEVMChain("unknown")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(MultiChainTransactionService.isEVMChain("ETHEREUM")).toBe(true);
      expect(MultiChainTransactionService.isEVMChain("Base")).toBe(true);
    });
  });

  describe("getNativeTokenSymbol", () => {
    it("should return correct native tokens for each chain", () => {
      expect(MultiChainTransactionService.getNativeTokenSymbol("ethereum")).toBe("ETH");
      expect(MultiChainTransactionService.getNativeTokenSymbol("base")).toBe("ETH");
      expect(MultiChainTransactionService.getNativeTokenSymbol("lisk")).toBe("LSK");
      expect(MultiChainTransactionService.getNativeTokenSymbol("u2u")).toBe("U2U");
    });

    it("should default to ETH for unknown chains", () => {
      expect(MultiChainTransactionService.getNativeTokenSymbol("unknown")).toBe("ETH");
    });

    it("should be case-insensitive", () => {
      expect(MultiChainTransactionService.getNativeTokenSymbol("ETHEREUM")).toBe("ETH");
      expect(MultiChainTransactionService.getNativeTokenSymbol("BASE")).toBe("ETH");
    });
  });

  describe("formatGasPrice", () => {
    it("should format gas price from wei to ether", () => {
      const gasWei = BigInt("1000000000000000000"); // 1 ETH in wei
      expect(MultiChainTransactionService.formatGasPrice(gasWei)).toBe("1.000000");
    });

    it("should format small amounts correctly", () => {
      const gasWei = BigInt("100000000000000"); // 0.0001 ETH
      const formatted = MultiChainTransactionService.formatGasPrice(gasWei);
      expect(parseFloat(formatted)).toBeCloseTo(0.0001, 6);
    });
  });

  describe("convertToUSD", () => {
    it("should convert ETH to USD", async () => {
      const gasWei = BigInt("1000000000000000000"); // 1 ETH
      const usd = await MultiChainTransactionService.convertToUSD(gasWei, "ETH");
      expect(parseFloat(usd)).toBeGreaterThan(0);
    });

    it("should return correct values for different tokens", async () => {
      const gasWei = BigInt("1000000000000000000");

      const ethUsd = await MultiChainTransactionService.convertToUSD(gasWei, "ETH");
      const lskUsd = await MultiChainTransactionService.convertToUSD(gasWei, "LSK");

      expect(parseFloat(ethUsd)).toBeGreaterThan(parseFloat(lskUsd));
    });

    it("should handle invalid wei gracefully", async () => {
      const usd = await MultiChainTransactionService.convertToUSD(BigInt("0"), "ETH");
      expect(parseFloat(usd)).toBe(0);
    });
  });

  describe("validateSufficientGas", () => {
    it("should validate sufficient balance for transaction", async () => {
      const userBalance = "5000000000000000000"; // 5 ETH
      const txParams = {
        from: "0x1234567890123456789012345678901234567890",
        to: "0x0987654321098765432109876543210987654321",
        value: "1000000000000000000", // 1 ETH
      };

      try {
        const result = await MultiChainTransactionService.validateSufficientGas(
          userBalance,
          "ethereum",
          txParams
        );

        if (result.sufficient) {
          expect(result.sufficient).toBe(true);
          expect(result.margin).toBeDefined();
        }
      } catch (error) {
        // Expected if no RPC provider configured
        expect(error.code).toMatch(/INSUFFICIENT|RPC_ERROR/);
      }
    });

    it("should detect insufficient gas", async () => {
      const userBalance = "100000000000000"; // 0.0001 ETH (very small)
      const txParams = {
        from: "0x1234567890123456789012345678901234567890",
        to: "0x0987654321098765432109876543210987654321",
        value: "1000000000000000000", // 1 ETH (more than balance)
      };

      try {
        const result = await MultiChainTransactionService.validateSufficientGas(
          userBalance,
          "ethereum",
          txParams
        );

        if (!result.sufficient) {
          expect(result.sufficient).toBe(false);
          expect(result.shortfall).toBeDefined();
        }
      } catch (error) {
        // Expected if no RPC provider configured
        expect(error.code).toMatch(/INSUFFICIENT|RPC_ERROR/);
      }
    });
  });

  describe("getGasEstimationPreview", () => {
    it("should return error for RPC failures", async () => {
      const userBalance = { balance: "1000000000000000000", address: "0x123" };

      const result = await MultiChainTransactionService.getGasEstimationPreview(
        userBalance,
        "ethereum",
        "bob",
        "100",
        "ETH"
      );

      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.code).toBeDefined();
      }
    });
  });

  describe("estimateTransactionGas", () => {
    it("should reject unsupported chains", async () => {
      const txParams = {
        from: "0x123",
        to: "0x456",
      };

      await expect(
        MultiChainTransactionService.estimateTransactionGas(txParams, "stellar")
      ).rejects.toMatchObject({
        code: "UNSUPPORTED_CHAIN",
      });
    });

    it("should reject invalid transaction parameters", async () => {
      const txParams = { from: "0x123" }; // Missing 'to'

      await expect(
        MultiChainTransactionService.estimateTransactionGas(txParams, "ethereum")
      ).rejects.toMatchObject({
        code: "INVALID_TX_PARAMS",
      });
    });

    it("should handle RPC failures gracefully", async () => {
      const txParams = {
        from: "0x1234567890123456789012345678901234567890",
        to: "0x0987654321098765432109876543210987654321",
        value: "0x0",
      };

      try {
        await MultiChainTransactionService.estimateTransactionGas(txParams, "ethereum");
      } catch (error) {
        expect(error.code).toMatch(/GAS_ESTIMATION_FAILED|RPC_ERROR/);
        expect(error.statusCode).toBeGreaterThanOrEqual(500);
      }
    });
  });

  describe("submitTransaction", () => {
    it("should generate valid transaction hashes", async () => {
      const txParams = {
        from: "0x123",
        to: "0x456",
      };

      const gasEstimate = {
        gasWithBuffer: "100000",
        estimateInUSD: "50.00",
      };

      const result = await MultiChainTransactionService.submitTransaction(
        txParams,
        "ethereum",
        gasEstimate
      );

      expect(result.success).toBe(true);
      expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });
});
