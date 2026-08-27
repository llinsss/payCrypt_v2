import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import db from "../config/database.js";
import Transaction from "../models/Transaction.js";
import ERC20AllowanceService from "../services/ERC20AllowanceService.js";
import { ethers } from "ethers";
import { getEvmProvider } from "../contracts/index.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
];

const MAX_UINT256 = ethers.MaxUint256;

export const erc20ApprovalWorker = redisConnection
  ? new Worker(
      "erc20-approval",
      async (job) => {
        const { userId, chain, tokenId, tokenAddress, spenderAddress, amount, txReference } = job.data;

        console.log(`🔐 Processing approval for token ${tokenAddress} on ${chain}`);

        try {
          const user = await db("users").where({ id: userId }).first();
          const token = await db("tokens").where({ id: tokenId }).first();

          if (!user || !token) {
            throw new Error("User or token not found");
          }

          const chainConfig = require("../contracts/evm.js").getEvmChain(chain);
          const provider = chainConfig.provider;
          const wallet = chainConfig.wallet;

          const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

          console.log(`Executing approve for spender: ${spenderAddress}, amount: ${MAX_UINT256.toString()}`);

          const approveTx = await erc20.approve(spenderAddress, MAX_UINT256);
          const approveReceipt = await approveTx.wait();

          if (!approveReceipt) {
            throw new Error("Approval transaction failed to confirm");
          }

          const txHash = approveReceipt.hash;

          await Transaction.create({
            user_id: userId,
            status: "completed",
            token_id: tokenId,
            chain_id: token.chain_id,
            reference: txReference,
            type: "approval",
            tx_hash: txHash,
            amount: 0,
            usd_value: 0,
            from_address: wallet.address,
            to_address: spenderAddress,
            description: `ERC-20 approval for ${token.symbol}`,
          });

          console.log(`✅ Approval ${txHash} recorded for token ${token.symbol}`);
          return { txHash, success: true };
        } catch (error) {
          console.error(`❌ Approval failed:`, error.message);
          throw error;
        }
      },
      { connection: redisConnection }
    )
  : null;

attachRedisErrorAlert(erc20ApprovalWorker, "erc20-approval-worker");

if (erc20ApprovalWorker) {
  console.log("⚙️ ERC-20 approval worker started");
} else {
  console.warn("⚠️ ERC-20 approval worker not available");
}
