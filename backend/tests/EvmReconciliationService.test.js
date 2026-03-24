import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Module mocks must be declared before importing the service
// ---------------------------------------------------------------------------

const mockGetBalance = jest.fn();
const mockBalanceOf = jest.fn();

jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getBalance: mockGetBalance,
      })),
      Contract: jest.fn().mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      })),
      formatUnits: actual.ethers.formatUnits,
      ZeroAddress: actual.ethers.ZeroAddress,
    },
  };
});

const mockBalanceUpdate = jest.fn();
const mockBalanceFindByUserIdAndTokenId = jest.fn();
const mockNotificationCreate = jest.fn();
const mockDbQuery = jest.fn();

jest.mock("../models/Balance.js", () => ({
  default: {
    update: mockBalanceUpdate,
    findByUserIdAndTokenId: mockBalanceFindByUserIdAndTokenId,
  },
}));

jest.mock("../models/Notification.js", () => ({
  default: { create: mockNotificationCreate },
}));

jest.mock("../config/database.js", () => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    first: mockDbQuery,
    join: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue([1]),
    fn: { now: jest.fn(() => new Date()) },
  };
  const db = jest.fn(() => queryBuilder);
  db.fn = queryBuilder.fn;
  return { default: db };
});

jest.mock("../contracts/index.js", () => ({
  getEvmProvider: jest.fn(() => ({ getBalance: mockGetBalance })),
}));

import EvmReconciliationService from "../services/EvmReconciliationService.js";
import { ethers } from "ethers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ETH_1 = ethers.parseEther("1.0"); // 1 ETH in wei
const ETH_1_05 = ethers.parseEther("1.05"); // slight over
const ETH_2 = ethers.parseEther("2.0"); // major discrepancy

function makeDbAccount(overrides = {}) {
  return {
    user_id: "user-1",
    address: "0xWallet",
    tag: "alice",
    ...overrides,
  };
}

function makeDbBalance(amount) {
  return { id: "balance-1", amount, user_id: "user-1", token_id: "token-1" };
}

function makeToken(price = 3000) {
  return { id: "token-1", symbol: "ETH", price, chain: "base" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EvmReconciliationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BASE_RPC_URL = "https://mainnet.base.org";
    process.env.BASE_USDC_ADDRESS = "0xUSDC";
    process.env.BASE_USDT_ADDRESS = "0xUSDT";
  });

  // ── fetchNativeBalance ─────────────────────────────────────────────────────

  describe("fetchNativeBalance", () => {
    it("returns BigInt balance from provider", async () => {
      mockGetBalance.mockResolvedValue(ETH_1);
      const provider = { getBalance: mockGetBalance };
      const result = await EvmReconciliationService.fetchNativeBalance(
        provider,
        "0xAddr",
      );
      expect(result).toBe(ETH_1);
    });

    it("throws a descriptive error on provider failure", async () => {
      mockGetBalance.mockRejectedValue(new Error("RPC timeout"));
      const provider = { getBalance: mockGetBalance };
      await expect(
        EvmReconciliationService.fetchNativeBalance(provider, "0xAddr"),
      ).rejects.toThrow(
        "Failed to fetch native balance for 0xAddr: RPC timeout",
      );
    });
  });

  // ── fetchErc20Balance ──────────────────────────────────────────────────────

  describe("fetchErc20Balance", () => {
    it("calls balanceOf and returns raw BigInt", async () => {
      const raw = BigInt("5000000"); // 5 USDC (6 decimals)
      mockBalanceOf.mockResolvedValue(raw);
      const provider = {};
      const result = await EvmReconciliationService.fetchErc20Balance(
        provider,
        "0xUSDC",
        "0xWallet",
      );
      expect(result).toBe(raw);
    });
  });

  // ── classifyDiscrepancy ────────────────────────────────────────────────────

  describe("classifyDiscrepancy", () => {
    it("returns ok for zero diff", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(0)).toBe("ok");
    });

    it("returns auto_correct for diff < $1", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(0.5)).toBe(
        "auto_correct",
      );
    });

    it("returns flag for diff between $1 and $10", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(5)).toBe("flag");
    });

    it("returns major for diff >= $10", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(15)).toBe("major");
    });
  });

  // ── reconcileTokenBalance ──────────────────────────────────────────────────

  describe("reconcileTokenBalance", () => {
    it("returns ok when balances match", async () => {
      mockDbQuery.mockResolvedValue(makeToken());
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));

      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base",
        user_id: "user-1",
        walletAddress: "0xWallet",
        tokenSymbol: "ETH",
        chainBalance: 1.0,
        tokenPrice: 3000,
      });

      expect(result.status).toBe("ok");
      expect(mockBalanceUpdate).not.toHaveBeenCalled();
    });

    it("auto-corrects minor discrepancy (< $1 USD)", async () => {
      mockDbQuery.mockResolvedValue(makeToken(3000));
      // 0.0001 ETH diff * $3000 = $0.30 — below $1 threshold
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));

      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base",
        user_id: "user-1",
        walletAddress: "0xWallet",
        tokenSymbol: "ETH",
        chainBalance: 1.0001,
        tokenPrice: 3000,
      });

      expect(result.status).toBe("corrected");
      expect(mockBalanceUpdate).toHaveBeenCalledTimes(1);
    });

    it("flags and corrects mid-range discrepancy ($1-$10 USD)", async () => {
      mockDbQuery.mockResolvedValue(makeToken(3000));
      // 0.002 ETH * $3000 = $6 — between $1 and $10
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));

      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base",
        user_id: "user-1",
        walletAddress: "0xWallet",
        tokenSymbol: "ETH",
        chainBalance: 1.002,
        tokenPrice: 3000,
      });

      expect(result.status).toBe("corrected_flagged");
      expect(mockBalanceUpdate).toHaveBeenCalledTimes(1);
    });

    it("flags major discrepancy (> $10 USD) without auto-correcting", async () => {
      mockDbQuery.mockResolvedValue(makeToken(3000));
      // 0.1 ETH * $3000 = $300 — major
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));

      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base",
        user_id: "user-1",
        walletAddress: "0xWallet",
        tokenSymbol: "ETH",
        chainBalance: 1.1,
        tokenPrice: 3000,
      });

      expect(result.status).toBe("major_discrepancy");
      expect(mockBalanceUpdate).not.toHaveBeenCalled();
      expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    });

    it("skips when token not found in DB", async () => {
      mockDbQuery.mockResolvedValue(null);

      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base",
        user_id: "user-1",
        walletAddress: "0xWallet",
        tokenSymbol: "UNKNOWN",
        chainBalance: 5.0,
        tokenPrice: 1,
      });

      expect(result.status).toBe("skipped");
    });
  });

  // ── reconcileChain ─────────────────────────────────────────────────────────

  describe("reconcileChain", () => {
    it("handles provider creation failure gracefully", async () => {
      const { getEvmProvider } = await import("../contracts/index.js");
      getEvmProvider.mockImplementationOnce(() => {
        throw new Error("Missing RPC URL");
      });

      const report = await EvmReconciliationService.reconcileChain("base");

      expect(report.errors).toBe(1);
      expect(report.error_details[0].error).toMatch("Missing RPC URL");
    });

    it("processes all 4 EVM chains independently", async () => {
      const chains = ["base", "lisk", "flow", "u2u"];

      const reconcileChainSpy = jest
        .spyOn(EvmReconciliationService, "reconcileChain")
        .mockResolvedValue({
          total: 0,
          ok: 0,
          corrected: 0,
          corrected_flagged: 0,
          major_discrepancies: 0,
          errors: 0,
          duration_ms: 10,
        });

      await EvmReconciliationService.runFullReconciliation();

      expect(reconcileChainSpy).toHaveBeenCalledTimes(4);
      for (const chain of chains) {
        expect(reconcileChainSpy).toHaveBeenCalledWith(chain);
      }

      reconcileChainSpy.mockRestore();
    });

    it("does not abort other chains when one chain fails", async () => {
      const reconcileChainSpy = jest
        .spyOn(EvmReconciliationService, "reconcileChain")
        .mockImplementation(async (chain) => {
          if (chain === "base") throw new Error("base RPC down");
          return {
            total: 1,
            ok: 1,
            corrected: 0,
            corrected_flagged: 0,
            major_discrepancies: 0,
            errors: 0,
            duration_ms: 5,
          };
        });

      const summary = await EvmReconciliationService.runFullReconciliation();

      // base errored — lisk/flow/u2u should still have results
      expect(summary.chains.base.error).toBeDefined();
      expect(summary.chains.lisk.ok).toBe(1);
      expect(summary.chains.flow.ok).toBe(1);
      expect(summary.chains.u2u.ok).toBe(1);

      reconcileChainSpy.mockRestore();
    });
  });
});
