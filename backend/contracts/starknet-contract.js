import { Account, Contract, RpcProvider, stark, uint256 } from "starknet";
import { mainABI } from "../abis/StarknetContractABI.js";

const config = {
  network: process.env.STARKNET_NETWORK || "sepolia",
  nodeUrl: process.env.STARKNET_RPC_URL,
  contractAddress: process.env.STARKNET_CONTRACT_ADDRESS,
  accountAddress: process.env.STARKNET_ACCOUNT_ADDRESS,
  privateKey: process.env.STARKNET_PRIVATE_KEY,
  contractABI: mainABI,
};

// Provider
const provider = new RpcProvider({ nodeUrl: config.nodeUrl });

// Account (for write ops)
let account = null;
if (config.accountAddress && config.privateKey) {
  account = new Account(
    provider,
    config.accountAddress,
    config.privateKey
  );
}

// Cached contract instance
let contract = null;

/**
 * Initialize and return the contract instance
 */
export const getContract = () => {
  if (!config.contractAddress) {
    throw new Error("❌ Contract address not provided in env vars");
  }

  if (!contract) {
    contract = new Contract(
      config.contractABI,
      config.contractAddress,
      account ?? provider
    );

    console.log("✅ StarkNet contract initialized");
    console.log("📝 Address:", config.contractAddress);
    console.log("🌐 Network:", config.network);
  }

  return contract;
};

// Utility functions
export const utils = {
  feltToString: (felt) => stark.feltToStr(felt),
  stringToFelt: (str) => stark.strToFelt(str),

  uint256ToBigInt: ({ low, high }) => BigInt(low) + (BigInt(high) << 128n),

  bigIntToUint256: (value) => uint256.bnToUint256(BigInt(value)),

  isValidStarkNetAddress: (address) => {
    try {
      return !!stark.validateAndParseAddress(address);
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
  config,
};
