import { ethers } from "ethers";

import { mainABI } from "../../abis/SolidityContractABI.js";

const config = {
  network: process.env.BASE_NETWORK || "testnet",
  nodeUrl: process.env.BASE_RPC_URL,
  contractAddress: process.env.BASE_CONTRACT_ADDRESS,
  accountAddress: process.env.BASE_ACCOUNT_ADDRESS,
  privateKey: process.env.BASE_PRIVATE_KEY,
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
