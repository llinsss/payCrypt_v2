import { ethers } from "ethers";
import { mainABI } from "../abis/SolidityContractABI.js";
import CircuitBreakerService from "../services/CircuitBreakerService.js";

// Provider cache to avoid creating duplicate provider instances
const providerCache = new Map();

// Supported EVM chains (matches EvmReconciliationService.EVM_CHAIN_CONFIG)
const SUPPORTED_EVM_CHAINS = ["base", "lisk", "flow", "u2u"];

/**
 * Validate that a chain is supported and has required RPC configuration.
 * @param {string} chain - The chain name
 * @throws {Error} If chain is unsupported or missing required config
 */
const validateChainConfig = (chain) => {
  const normalizedChain = chain.trim().toLowerCase();

  if (!SUPPORTED_EVM_CHAINS.includes(normalizedChain)) {
    throw new Error(
      `Unsupported EVM chain: ${chain}. Supported chains: ${SUPPORTED_EVM_CHAINS.join(", ")}`
    );
  }

  const envPrefix = normalizedChain.toUpperCase();
  const rpcUrl = process.env[`${envPrefix}_RPC_URL`];
  const contractAddress = process.env[`${envPrefix}_CONTRACT_ADDRESS`];
  const privateKey = process.env[`${envPrefix}_PRIVATE_KEY`];

  if (!rpcUrl) {
    throw new Error(
      `Missing RPC configuration for chain: ${normalizedChain}. Set ${envPrefix}_RPC_URL environment variable.`
    );
  }

  if (!contractAddress) {
    throw new Error(
      `Missing contract configuration for chain: ${normalizedChain}. Set ${envPrefix}_CONTRACT_ADDRESS environment variable.`
    );
  }

  if (!privateKey) {
    throw new Error(
      `Missing private key configuration for chain: ${normalizedChain}. Set ${envPrefix}_PRIVATE_KEY environment variable.`
    );
  }
};

/**
 * Unified EVM chain configuration with provider caching.
 * Repeated calls for the same chain return the same provider instance.
 * @param {string} chain - The EVM chain name ("base", "flow", "lisk", "u2u")
 * @returns {Object} Provider, wallet, contract, and helpers
 * @throws {Error} If chain is unsupported or RPC config is missing/invalid
 */
export const getEvmChain = (chain) => {
  const normalizedChain = chain.trim().toLowerCase();

  // Check if provider is already cached
  if (providerCache.has(normalizedChain)) {
    return providerCache.get(normalizedChain);
  }

  // Validate configuration before creating provider
  validateChainConfig(chain);

  const envPrefix = normalizedChain.toUpperCase();

  const config = {
    network: process.env[`${envPrefix}_NETWORK`] || "testnet",
    nodeUrl: process.env[`${envPrefix}_RPC_URL`],
    contractAddress: process.env[`${envPrefix}_CONTRACT_ADDRESS`],
    accountAddress: process.env[`${envPrefix}_ACCOUNT_ADDRESS`],
    privateKey: process.env[`${envPrefix}_PRIVATE_KEY`],
    contractABI: mainABI,
  };

  const provider = new ethers.JsonRpcProvider(config.nodeUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(
    config.contractAddress,
    config.contractABI,
    wallet
  );

  /**
   * Execute an operation on the EVM contract with circuit breaker protection
   */
  const fire = async (operation, ...args) => {
    return CircuitBreakerService.fire("evm", async () => {
      return operation(...args);
    });
  };

  const chainData = {
    provider,
    wallet,
    contract,
    config,
    fire,
  };

  // Cache the provider for reuse
  providerCache.set(normalizedChain, chainData);

  return chainData;
};

/**
 * Get the provider cache for testing purposes (allows clearing cache between tests).
 */
export const getProviderCache = () => providerCache;

/**
 * Clear the provider cache. Primarily for testing.
 */
export const clearProviderCache = () => providerCache.clear();
