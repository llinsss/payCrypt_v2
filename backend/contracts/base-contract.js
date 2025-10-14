import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

import { mainABI } from "../abis/SolidityContractABI.js";

const BASE_CONFIG = {
  network: process.env.BASE_NETWORK || "testnet",
  nodeUrl: process.env.BASE_RPC_URL,
  contractAddress: process.env.BASE_CONTRACT_ADDRESS,
  accountAddress: process.env.BASE_ACCOUNT_ADDRESS,
  privateKey: process.env.BASE_PRIVATE_KEY,
  contractABI: mainABI,
};

const provider = new ethers.JsonRpcProvider(BASE_CONFIG.nodeUrl);

const wallet = new ethers.Wallet(BASE_CONFIG.privateKey, provider);

const contract = new ethers.Contract(
  BASE_CONFIG.contractAddress,
  BASE_CONFIG.contractABI,
  wallet
);

export default {
  provider,
  wallet,
  contract,
  BASE_CONFIG
};