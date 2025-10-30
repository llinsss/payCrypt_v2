import { ethers } from "ethers";

import { mainABI } from "../../abis/SolidityContractABI.js";

const config = {
  network: process.env.LISK_NETWORK || "testnet",
  nodeUrl: process.env.LISK_RPC_URL,
  contractAddress: process.env.LISK_CONTRACT_ADDRESS,
  accountAddress: process.env.LISK_ACCOUNT_ADDRESS,
  privateKey: process.env.LISK_PRIVATE_KEY,
  contractABI: mainABI,
};

const provider = new ethers.JsonRpcProvider(config.nodeUrl);

const wallet = new ethers.Wallet(config.privateKey, provider);

const contract = new ethers.Contract(
  config.contractAddress,
  config.contractABI,
  wallet
);

export default {
  provider,
  wallet,
  contract,
  config,
};
