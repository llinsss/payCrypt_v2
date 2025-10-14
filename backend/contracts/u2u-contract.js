import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

import { mainABI } from "../abis/SolidityContractABI.js";

const config = {
  network: process.env.U2U_NETWORK || "mainnet",
  nodeUrl: process.env.U2U_RPC_URL,
  contractAddress: process.env.U2U_CONTRACT_ADDRESS,
  accountAddress: process.env.U2U_ACCOUNT_ADDRESS,
  privateKey: process.env.U2U_PRIVATE_KEY,
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
