import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

import { mainABI } from "../abis/SolidityContractABI.js";

const U2U_CONFIG = {
  network: process.env.U2U_NETWORK || "mainnet",
  nodeUrl: process.env.U2U_RPC_URL,
  contractAddress: process.env.U2U_CONTRACT_ADDRESS,
  accountAddress: process.env.U2U_ACCOUNT_ADDRESS,
  privateKey: process.env.U2U_PRIVATE_KEY,
  contractABI: mainABI,
};

const provider = new ethers.JsonRpcProvider(U2U_CONFIG.nodeUrl);

const wallet = new ethers.Wallet(U2U_CONFIG.privateKey, provider);

const contract = new ethers.Contract(
  U2U_CONFIG.contractAddress,
  U2U_CONFIG.contractABI,
  wallet
);

export default {
  provider,
  wallet,
  contract,
  U2U_CONFIG,
};
