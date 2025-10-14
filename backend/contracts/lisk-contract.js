import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

import { mainABI } from "../abis/SolidityContractABI.js";

const LISK_CONFIG = {
  network: process.env.LISK_NETWORK || "testnet",
  nodeUrl: process.env.LISK_RPC_URL,
  contractAddress: process.env.LISK_CONTRACT_ADDRESS,
  accountAddress: process.env.LISK_ACCOUNT_ADDRESS,
  privateKey: process.env.LISK_PRIVATE_KEY,
  contractABI: mainABI,
};

const provider = new ethers.JsonRpcProvider(LISK_CONFIG.nodeUrl);

const wallet = new ethers.Wallet(LISK_CONFIG.privateKey, provider);

const contract = new ethers.Contract(
  LISK_CONFIG.contractAddress,
  LISK_CONFIG.contractABI,
  wallet
);

export default {
  provider,
  wallet,
  contract,
  LISK_CONFIG,
};
