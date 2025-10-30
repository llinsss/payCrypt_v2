import { ethers } from "ethers";
import { mainABI } from "../abis/SolidityContractABI.js";

/**
 * Unified EVM chain configuration.
 * @param {"base" | "flow" | "lisk" | "u2u"} chain - The EVM chain name.
 */
export const getEvmChain = (chain) => {
  const envPrefix = chain.trim().toUpperCase();

  const config = {
    network: process.env[`${envPrefix}_NETWORK`] || "testnet",
    nodeUrl: process.env[`${envPrefix}_RPC_URL`],
    contractAddress: process.env[`${envPrefix}_CONTRACT_ADDRESS`],
    accountAddress: process.env[`${envPrefix}_ACCOUNT_ADDRESS`],
    privateKey: process.env[`${envPrefix}_PRIVATE_KEY`],
    contractABI: mainABI,
  };

  if (!config.nodeUrl || !config.contractAddress || !config.privateKey) {
    throw new Error(`Missing environment variables for chain: ${chain}`);
  }

  const provider = new ethers.JsonRpcProvider(config.nodeUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(
    config.contractAddress,
    config.contractABI,
    wallet
  );

  return {
    provider,
    wallet,
    contract,
    config,
  };
};
