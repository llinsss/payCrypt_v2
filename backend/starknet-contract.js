import {
  Account,
  Contract,
  RpcProvider,
  stark,
  uint256,
  validateAndParseAddress,
} from "starknet";
import { mainABI } from "./abis/StarknetContractABI.js";

const STARKNET_CONFIG = {
  network: process.env.STARKNET_NETWORK || "mainnet-alpha",
  nodeUrl: process.env.STARKNET_RPC_URL,
  contractAddress: process.env.STARKNET_CONTRACT_ADDRESS,
  accountAddress: process.env.STARKNET_ACCOUNT_ADDRESS,
  privateKey: process.env.STARKNET_PRIVATE_KEY,
  contractABI: mainABI,
};

// Validate minimal config
if (!STARKNET_CONFIG.nodeUrl) {
  throw new Error("❌ STARKNET_RPC_URL must be set in environment variables");
}

// Provider
const provider = new RpcProvider({ nodeUrl: STARKNET_CONFIG.nodeUrl });

// Account (for write ops)
let account = null;
if (STARKNET_CONFIG.accountAddress && STARKNET_CONFIG.privateKey) {
  account = new Account(
    provider,
    STARKNET_CONFIG.accountAddress,
    STARKNET_CONFIG.privateKey
  );
}

// Cached contract instance
let contract = null;

/**
 * Initialize and return the contract instance
 */
export const getContract = () => {
  if (!STARKNET_CONFIG.contractAddress) {
    throw new Error("❌ Contract address not provided in env vars");
  }

  if (!contract) {
    contract = new Contract(
      STARKNET_CONFIG.contractABI,
      STARKNET_CONFIG.contractAddress,
      account ?? provider
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("✅ StarkNet contract initialized");
      console.log("📝 Address:", STARKNET_CONFIG.contractAddress);
      console.log("🌐 Network:", STARKNET_CONFIG.network);
    }
  }

  return { contract, provider, account };
};

// Utility functions
export const utils = {
  feltToString: (felt) => stark.feltToStr(felt),
  stringToFelt: (str) => stark.strToFelt(str),

  uint256ToBigInt: ({ low, high }) => {
    try {
      return BigInt(low) + (BigInt(high) << 128n);
    } catch {
      return 0n;
    }
  },

  bigIntToUint256: (value) => uint256.bnToUint256(BigInt(value)),

  isValidStarkNetAddress: (address) => {
    try {
      validateAndParseAddress(address);
      return true;
    } catch {
      return false;
    }
  },
};

export default {
  provider,
  account,
  getContract,
  utils,
  STARKNET_CONFIG,
};
