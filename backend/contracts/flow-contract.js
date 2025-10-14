import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

import { mainABI } from "../abis/SolidityContractABI.js";

const FLOW_CONFIG = {
  network: process.env.FLOW_NETWORK || "testnet",
  nodeUrl: process.env.FLOW_RPC_URL,
  contractAddress: process.env.FLOW_CONTRACT_ADDRESS,
  accountAddress: process.env.FLOW_ACCOUNT_ADDRESS,
  privateKey: process.env.FLOW_PRIVATE_KEY,
  contractABI: mainABI,
};

const provider = new ethers.JsonRpcProvider(FLOW_CONFIG.nodeUrl);

const wallet = new ethers.Wallet(FLOW_CONFIG.privateKey, provider);

const contract = new ethers.Contract(
  FLOW_CONFIG.contractAddress,
  FLOW_CONFIG.contractABI,
  wallet
);

export default {
  provider,
  wallet,
  contract,
  FLOW_CONFIG
};