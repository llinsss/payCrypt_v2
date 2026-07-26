import { jest } from "@jest/globals";

const mockGetBalance = jest.fn();
const mockBalanceOf = jest.fn();
const mockBalanceUpdate = jest.fn();
const mockBalanceFindByUserIdAndTokenId = jest.fn();
const mockNotificationCreate = jest.fn();
const mockDbFirst = jest.fn();
const mockDbInsert = jest.fn().mockResolvedValue([1]);
const mockGetEvmProvider = jest.fn(() => ({ getBalance: mockGetBalance }));

const parseUnits = (value, decimals) => BigInt(Math.round(Number(value) * 10 ** decimals));
const formatUnits = (raw, decimals) => (Number(raw) / 10 ** decimals).toString();

jest.unstable_mockModule("ethers", () => ({
  ethers: {
    parseEther: (value) => parseUnits(value, 18),
    formatUnits,
    ZeroAddress: "0x0000000000000000000000000000000000000000",
    JsonRpcProvider: jest.fn(() => ({ getBalance: mockGetBalance })),
    Contract: jest.fn(() => ({ balanceOf: mockBalanceOf })),
  },
}));

jest.unstable_mockModule("../models/Balance.js", () => ({
  default: {
    update: mockBalanceUpdate,
    findByUserIdAndTokenId: mockBalanceFindByUserIdAndTokenId,
  },
}));

jest.unstable_mockModule("../models/Notification.js", () => ({
  default: { create: mockNotificationCreate },
}));

jest.unstable_mockModule("../config/database.js", () => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    first: mockDbFirst,
    join: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue([]),
    insert: mockDbInsert,
  };
  const db = jest.fn(() => queryBuilder);
  db.fn = { now: jest.fn(() => new Date()) };
  return { default: db };
});

jest.unstable_mockModule("../contracts/index.js", () => ({
  getEvmProvider: mockGetEvmProvider,
}));

const { default: EvmReconciliationService } = await import("../services/EvmReconciliationService.js");
const { ethers } = await import("ethers");

const ETH_1 = ethers.parseEther("1.0");

function makeDbBalance(amount) {
  return { id: "balance-1", amount, user_id: "user-1", token_id: "token-1" };
}

function makeToken(price = 3000) {
  return { id: "token-1", symbol: "ETH", price, chain: "base" };
}

describe("EvmReconciliationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEvmProvider.mockImplementation(() => ({ getBalance: mockGetBalance }));
    process.env.BASE_RPC_URL = "https://mainnet.base.org";
    process.env.BASE_USDC_ADDRESS = "0x0000000000000000000000000000000000000001";
    process.env.BASE_USDT_ADDRESS = "0x0000000000000000000000000000000000000002";
  });

  describe("fetchNativeBalance", () => {
    it("returns BigInt balance from provider", async () => {
      mockGetBalance.mockResolvedValue(ETH_1);
      const provider = { getBalance: mockGetBalance };
      const result = await EvmReconciliationService.fetchNativeBalance(provider, "0xAddr");
      expect(result).toBe(ETH_1);
    });

    it("throws a descriptive error on provider failure", async () => {
      mockGetBalance.mockRejectedValue(new Error("RPC timeout"));
      const provider = { getBalance: mockGetBalance };
      await expect(EvmReconciliationService.fetchNativeBalance(provider, "0xAddr"))
        .rejects.toThrow("Failed to fetch native balance for 0xAddr: RPC timeout");
    });
  });

  describe("fetchErc20Balance", () => {
    it("calls balanceOf and returns raw BigInt", async () => {
      const raw = BigInt("5000000");
      mockBalanceOf.mockResolvedValue(raw);
      const result = await EvmReconciliationService.fetchErc20Balance({}, "0xUSDC", "0xWallet");
      expect(result).toBe(raw);
      expect(mockBalanceOf).toHaveBeenCalledWith("0xWallet");
    });
  });

  describe("classifyDiscrepancy", () => {
    it("returns ok for zero diff", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(0)).toBe("ok");
    });

    it("returns auto_correct for diff < $1", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(0.5)).toBe("auto_correct");
    });

    it("returns flag for diff between $1 and $10", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(5)).toBe("flag");
    });

    it("returns major for diff >= $10", () => {
      expect(EvmReconciliationService.classifyDiscrepancy(15)).toBe("major");
    });
  });

  describe("reconcileTokenBalance", () => {
    it("returns ok when balances match", async () => {
      mockDbFirst.mockResolvedValue(makeToken());
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));
      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base", user_id: "user-1", walletAddress: "0xWallet", tokenSymbol: "ETH", chainBalance: 1.0, tokenPrice: 3000,
      });
      expect(result.status).toBe("ok");
      expect(mockBalanceUpdate).not.toHaveBeenCalled();
    });

    it("auto-corrects minor discrepancy (< $1 USD)", async () => {
      mockDbFirst.mockResolvedValue(makeToken(3000));
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));
      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base", user_id: "user-1", walletAddress: "0xWallet", tokenSymbol: "ETH", chainBalance: 1.0001, tokenPrice: 3000,
      });
      expect(result.status).toBe("corrected");
      expect(mockBalanceUpdate).toHaveBeenCalledTimes(1);
    });

    it("flags and corrects mid-range discrepancy ($1-$10 USD)", async () => {
      mockDbFirst.mockResolvedValue(makeToken(3000));
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));
      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base", user_id: "user-1", walletAddress: "0xWallet", tokenSymbol: "ETH", chainBalance: 1.002, tokenPrice: 3000,
      });
      expect(result.status).toBe("corrected_flagged");
      expect(mockBalanceUpdate).toHaveBeenCalledTimes(1);
    });

    it("flags major discrepancy (> $10 USD) without auto-correcting", async () => {
      mockDbFirst.mockResolvedValue(makeToken(3000));
      mockBalanceFindByUserIdAndTokenId.mockResolvedValue(makeDbBalance(1.0));
      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base", user_id: "user-1", walletAddress: "0xWallet", tokenSymbol: "ETH", chainBalance: 1.1, tokenPrice: 3000,
      });
      expect(result.status).toBe("major_discrepancy");
      expect(mockBalanceUpdate).not.toHaveBeenCalled();
      expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    });

    it("skips when token not found in DB", async () => {
      mockDbFirst.mockResolvedValue(null);
      const result = await EvmReconciliationService.reconcileTokenBalance({
        chain: "base", user_id: "user-1", walletAddress: "0xWallet", tokenSymbol: "UNKNOWN", chainBalance: 5.0, tokenPrice: 1,
      });
      expect(result.status).toBe("skipped");
    });
  });

  describe("reconcileChain", () => {
    it("handles provider creation failure gracefully", async () => {
      mockGetEvmProvider.mockImplementationOnce(() => { throw new Error("Missing RPC URL"); });
      const report = await EvmReconciliationService.reconcileChain("base");
      expect(report.errors).toBe(1);
      expect(report.error_details[0].error).toMatch("Missing RPC URL");
    });

    it("processes all 4 EVM chains independently", async () => {
      const chains = ["base", "lisk", "flow", "u2u"];
      const reconcileChainSpy = jest.spyOn(EvmReconciliationService, "reconcileChain").mockResolvedValue({
        total: 0, ok: 0, corrected: 0, corrected_flagged: 0, major_discrepancies: 0, errors: 0, duration_ms: 10,
      });
      await EvmReconciliationService.runFullReconciliation();
      expect(reconcileChainSpy).toHaveBeenCalledTimes(4);
      for (const chain of chains) expect(reconcileChainSpy).toHaveBeenCalledWith(chain);
      reconcileChainSpy.mockRestore();
    });

    it("does not abort other chains when one chain fails", async () => {
      const reconcileChainSpy = jest.spyOn(EvmReconciliationService, "reconcileChain").mockImplementation(async (chain) => {
        if (chain === "base") throw new Error("base RPC down");
        return { total: 1, ok: 1, corrected: 0, corrected_flagged: 0, major_discrepancies: 0, errors: 0, duration_ms: 5 };
      });
      const summary = await EvmReconciliationService.runFullReconciliation();
      expect(summary.chains.base.error).toBeDefined();
      expect(summary.chains.lisk.ok).toBe(1);
      expect(summary.chains.flow.ok).toBe(1);
      expect(summary.chains.u2u.ok).toBe(1);
      reconcileChainSpy.mockRestore();
    });
  });
});
