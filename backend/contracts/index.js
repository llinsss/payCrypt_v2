import { ethers } from "ethers";
import * as evm from "./services/evm.js";
import * as starknet from "./services/starknet.js";
import * as flow from "./services/flow.js";

export const chains = {
  STRK: "starknet",
  BASE: "base",
  LSK: "lisk",
  FLOW: "flow",
  U2U: "u2u",
};

export const formatChainAmount = (chain, amount) => {
  if (amount === null || amount === undefined) return "0";
  const bigAmount = BigInt(amount.toString());
  const chainKey = chain.trim().toLowerCase();

  switch (chainKey) {
    case "base":
    case "u2u":
      return ethers.formatEther(bigAmount);
    case "lisk":
      return (Number(bigAmount) / 1e8).toFixed(8);
    case "flow":
      return (Number(bigAmount) / 1e8).toFixed(8);
    case "starknet":
      return (Number(bigAmount) / 1e18).toFixed(6);
    default:
      throw new Error(`Unsupported chain for formatting: ${chain}`);
  }
};

export const register = async (chain, tag) => {
  if (chain === "starknet") {
    return await starknet.createTagAddress(tag);
  } else if (chain === "flow") {
    return await flow.createTagAddress(tag);
  } else {
    return await evm.createTagAddress(chain, tag);
  }
};

export const tag_address = async (chain, tag) => {
  if (chain === "starknet") {
    return await starknet.getTagAddress(tag);
  } else if (chain === "flow") {
    return await flow.getTagAddress(tag);
  } else {
    return await evm.getTagAddress(chain, tag);
  }
};

export const tag_balance = async (chain, tag) => {
  if (chain === "starknet") {
    return await starknet.getTagBalance(tag);
  } else if (chain === "flow") {
    return await flow.getTagBalance(tag);
  } else {
    return await evm.getTagBalance(chain, tag);
  }
};

export const send_via_tag = async (payload) => {
  if (payload.chain === "starknet") {
    return await starknet.sendToTag(payload);
  } else if (payload.chain === "flow") {
    return await flow.sendToTag(payload);
  } else {
    return await evm.sendToTag(payload);
  }
};

export const send_via_wallet = async (payload) => {
  if (payload.chain === "starknet") {
    return await starknet.sendToWallet(payload);
  } else if (payload.chain === "flow") {
    return await flow.sendToWallet(payload);
  } else {
    return await evm.sendToWallet(payload);
  }
};

/**
 * Get a raw ethers provider for a given EVM-compatible chain.
 * Providers are cached per chain to avoid creating duplicate instances.
 * Used by EvmReconciliationService for on-chain balance queries.
 * @param {string} chain - The EVM chain name ("base", "flow", "lisk", "u2u")
 * @returns {ethers.JsonRpcProvider} Provider instance for the chain
 * @throws {Error} If chain is unsupported or RPC configuration is missing
 */
export const getEvmProvider = (chain) => {
  const { provider } = evm.getEvmChain(chain);
  return provider;
};

// Export cache helpers for testing and observability
export const getProviderCache = evm.getProviderCache;
export const clearProviderCache = evm.clearProviderCache;
