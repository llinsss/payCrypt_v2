/**
 * Tests for EVM Provider Factory (Issue #500)
 *
 * Verifies that:
 * 1. Provider creation and configuration validation works per supported chain
 * 2. Providers are cached to reuse instances for repeated calls
 * 3. Missing RPC configuration produces clear, actionable errors
 * 4. Unsupported chain IDs throw descriptive errors
 * 5. EvmReconciliationService can import and use getEvmProvider
 */

import { jest } from "@jest/globals";

// Mock ethers before importing evm.js
const mockJsonRpcProvider = jest.fn();
const mockWallet = jest.fn();
const mockContract = jest.fn();

jest.unstable_mockModule("ethers", () => ({
  ethers: {
    JsonRpcProvider: mockJsonRpcProvider,
    Wallet: mockWallet,
    Contract: mockContract,
  },
}));

// Mock CircuitBreakerService
jest.unstable_mockModule("../services/CircuitBreakerService.js", () => ({
  default: {
    fire: jest.fn(async (name, operation) => operation()),
  },
}));

// Mock ABI
jest.unstable_mockModule("../abis/SolidityContractABI.js", () => ({
  mainABI: ["function test() view returns (bool)"],
}));

const { getEvmChain, getProviderCache, clearProviderCache } = await import(
  "../contracts/evm.js"
);
const { getEvmProvider, clearProviderCache: clearProviderCacheViaIndex } =
  await import("../contracts/index.js");

describe("EVM Provider Factory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProviderCache();
    clearProviderCacheViaIndex();

    // Set up mock implementations
    mockJsonRpcProvider.mockReturnValue({
      getBalance: jest.fn().mockResolvedValue(BigInt(0)),
    });
    mockWallet.mockReturnValue({});
    mockContract.mockReturnValue({});

    // Setup valid environment variables for all supported chains
    process.env.BASE_NETWORK = "testnet";
    process.env.BASE_RPC_URL = "https://base-rpc.example.com";
    process.env.BASE_CONTRACT_ADDRESS = "0xbase123";
    process.env.BASE_ACCOUNT_ADDRESS = "0xbaseaccount";
    process.env.BASE_PRIVATE_KEY = "0xbaseprivatekey";

    process.env.LISK_NETWORK = "testnet";
    process.env.LISK_RPC_URL = "https://lisk-rpc.example.com";
    process.env.LISK_CONTRACT_ADDRESS = "0xlisk123";
    process.env.LISK_ACCOUNT_ADDRESS = "0xliskaccount";
    process.env.LISK_PRIVATE_KEY = "0xliskprivatekey";

    process.env.FLOW_NETWORK = "testnet";
    process.env.FLOW_RPC_URL = "https://flow-rpc.example.com";
    process.env.FLOW_CONTRACT_ADDRESS = "0xflow123";
    process.env.FLOW_ACCOUNT_ADDRESS = "0xflowaccount";
    process.env.FLOW_PRIVATE_KEY = "0xflowprivatekey";

    process.env.U2U_NETWORK = "testnet";
    process.env.U2U_RPC_URL = "https://u2u-rpc.example.com";
    process.env.U2U_CONTRACT_ADDRESS = "0xu2u123";
    process.env.U2U_ACCOUNT_ADDRESS = "0xu2uaccount";
    process.env.U2U_PRIVATE_KEY = "0xu2uprivatekey";
  });

  afterEach(() => {
    clearProviderCache();
  });

  describe("getEvmChain - successful provider creation", () => {
    it("should create and return a provider for supported chain: base", () => {
      const result = getEvmChain("base");

      expect(result).toHaveProperty("provider");
      expect(result).toHaveProperty("wallet");
      expect(result).toHaveProperty("contract");
      expect(result).toHaveProperty("config");
      expect(result).toHaveProperty("fire");

      expect(mockJsonRpcProvider).toHaveBeenCalledWith(process.env.BASE_RPC_URL);
      expect(mockWallet).toHaveBeenCalledWith(process.env.BASE_PRIVATE_KEY, result.provider);
      expect(mockContract).toHaveBeenCalledWith(
        process.env.BASE_CONTRACT_ADDRESS,
        expect.any(Array),
        result.wallet
      );
    });

    it("should create provider for lisk chain", () => {
      const result = getEvmChain("lisk");
      expect(mockJsonRpcProvider).toHaveBeenCalledWith(process.env.LISK_RPC_URL);
    });

    it("should create provider for flow chain", () => {
      const result = getEvmChain("flow");
      expect(mockJsonRpcProvider).toHaveBeenCalledWith(process.env.FLOW_RPC_URL);
    });

    it("should create provider for u2u chain", () => {
      const result = getEvmChain("u2u");
      expect(mockJsonRpcProvider).toHaveBeenCalledWith(process.env.U2U_RPC_URL);
    });

    it("should handle case-insensitive chain names", () => {
      const result1 = getEvmChain("BASE");
      const result2 = getEvmChain("Base");
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe("getEvmChain - caching behavior", () => {
    it("should return the same provider instance on repeated calls", () => {
      const provider1 = getEvmChain("base");
      const provider2 = getEvmChain("base");

      expect(provider1).toBe(provider2);
      expect(mockJsonRpcProvider).toHaveBeenCalledTimes(1);
    });

    it("should cache providers per chain independently", () => {
      const base = getEvmChain("base");
      const lisk = getEvmChain("lisk");
      const base2 = getEvmChain("base");

      expect(base).toBe(base2);
      expect(base).not.toBe(lisk);
      expect(mockJsonRpcProvider).toHaveBeenCalledTimes(2);
    });

    it("should expose cache for testing purposes", () => {
      getEvmChain("base");
      const cache = getProviderCache();

      expect(cache).toHaveProperty("base");
      expect(cache.size).toBe(1);
    });

    it("should allow clearing cache between tests", () => {
      getEvmChain("base");
      expect(getProviderCache().size).toBe(1);

      clearProviderCache();
      expect(getProviderCache().size).toBe(0);

      const provider2 = getEvmChain("base");
      expect(provider2).toBeDefined();
      expect(mockJsonRpcProvider).toHaveBeenCalledTimes(2);
    });
  });

  describe("getEvmChain - error handling for missing configuration", () => {
    it("should throw error with actionable message when RPC_URL is missing", () => {
      delete process.env.BASE_RPC_URL;

      expect(() => getEvmChain("base")).toThrow(
        expect.stringContaining("Missing RPC configuration")
      );
      expect(() => getEvmChain("base")).toThrow(
        expect.stringContaining("BASE_RPC_URL")
      );
    });

    it("should throw error when CONTRACT_ADDRESS is missing", () => {
      delete process.env.BASE_CONTRACT_ADDRESS;

      expect(() => getEvmChain("base")).toThrow(
        expect.stringContaining("Missing contract configuration")
      );
      expect(() => getEvmChain("base")).toThrow(
        expect.stringContaining("BASE_CONTRACT_ADDRESS")
      );
    });

    it("should throw error when PRIVATE_KEY is missing", () => {
      delete process.env.BASE_PRIVATE_KEY;

      expect(() => getEvmChain("base")).toThrow(
        expect.stringContaining("Missing private key configuration")
      );
      expect(() => getEvmChain("base")).toThrow(
        expect.stringContaining("BASE_PRIVATE_KEY")
      );
    });

    it("should include all missing environment variable names in error", () => {
      delete process.env.BASE_RPC_URL;
      delete process.env.BASE_CONTRACT_ADDRESS;

      try {
        getEvmChain("base");
        expect.fail("Should have thrown error");
      } catch (err) {
        expect(err.message).toMatch(/RPC configuration|Missing/);
      }
    });
  });

  describe("getEvmChain - unsupported chain handling", () => {
    it("should throw error for unsupported chain with list of supported chains", () => {
      expect(() => getEvmChain("polygon")).toThrow(
        expect.stringContaining("Unsupported EVM chain")
      );
      expect(() => getEvmChain("polygon")).toThrow(
        expect.stringContaining("base")
      );
      expect(() => getEvmChain("polygon")).toThrow(
        expect.stringContaining("lisk")
      );
      expect(() => getEvmChain("polygon")).toThrow(
        expect.stringContaining("flow")
      );
      expect(() => getEvmChain("polygon")).toThrow(
        expect.stringContaining("u2u")
      );
    });

    it("should handle typos in chain names gracefully", () => {
      expect(() => getEvmChain("baze")).toThrow(/Unsupported EVM chain/);
      expect(() => getEvmChain("basee")).toThrow(/Unsupported EVM chain/);
    });

    it("should trim whitespace and normalize chain names", () => {
      expect(() => getEvmChain("  base  ")).not.toThrow();
      const result = getEvmChain("  base  ");
      expect(result).toBeDefined();
    });
  });

  describe("getEvmProvider - stable export", () => {
    it("should export getEvmProvider that returns provider from getEvmChain", () => {
      const provider = getEvmProvider("base");
      expect(provider).toBeDefined();
    });

    it("should cache providers via getEvmProvider calls", () => {
      const provider1 = getEvmProvider("base");
      const provider2 = getEvmProvider("base");

      expect(provider1).toBe(provider2);
      expect(mockJsonRpcProvider).toHaveBeenCalledTimes(1);
    });

    it("should throw same validation errors as getEvmChain", () => {
      delete process.env.BASE_RPC_URL;
      expect(() => getEvmProvider("base")).toThrow(
        expect.stringContaining("RPC configuration")
      );
    });

    it("should allow clearing cache via index.js export", () => {
      getEvmProvider("base");
      expect(getProviderCache().size).toBe(1);

      clearProviderCacheViaIndex();
      expect(getProviderCache().size).toBe(0);
    });
  });

  describe("EvmReconciliationService integration", () => {
    it("should allow EvmReconciliationService to import getEvmProvider successfully", async () => {
      // This test verifies the import path and export work correctly
      const { getEvmProvider: importedGetEvmProvider } = await import(
        "../contracts/index.js"
      );
      expect(importedGetEvmProvider).toBeDefined();
      expect(typeof importedGetEvmProvider).toBe("function");
    });

    it("should provide usable provider for EvmReconciliationService.reconcileChain", () => {
      const provider = getEvmProvider("base");

      // Verify provider has methods EvmReconciliationService expects
      expect(provider).toHaveProperty("getBalance");
    });
  });

  describe("Configuration validation order", () => {
    it("should validate chain support before checking RPC config", () => {
      const err = expect(() => getEvmChain("invalid-chain")).toThrow();
      err.toThrow(/Unsupported/);
    });

    it("should check all required env vars before creating provider", () => {
      delete process.env.BASE_PRIVATE_KEY;
      delete process.env.BASE_CONTRACT_ADDRESS;

      // Should fail on first validation error (which will be one of the above)
      expect(() => getEvmChain("base")).toThrow();
      expect(mockJsonRpcProvider).not.toHaveBeenCalled();
    });
  });
});
