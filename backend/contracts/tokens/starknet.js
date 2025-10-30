import { Account, Contract, RpcProvider } from "starknet";
import { mainABI } from "../../abis/StarknetContractABI.js";

const config = {
  network: process.env.STARKNET_NETWORK || "sepolia",
  nodeUrl: process.env.STARKNET_RPC_URL,
  contractAddress: process.env.STARKNET_CONTRACT_ADDRESS,
  accountAddress: process.env.STARKNET_ACCOUNT_ADDRESS,
  privateKey: process.env.STARKNET_PRIVATE_KEY,
  contractABI: mainABI,
};

const provider = new RpcProvider({ nodeUrl: config.nodeUrl });

let account = null;
if (config.accountAddress && config.privateKey) {
  account = new Account(provider, config.accountAddress, config.privateKey);
}

export const getContract = () => {
  if (!config.contractAddress) {
    throw new Error("❌ Starknet Contract address not provided in env");
  }
  const contract = new Contract(
    config.contractABI,
    config.contractAddress,
    account ?? provider
  );
  return contract;
};

export default {
  provider,
  account,
  getContract,
  config,
};
