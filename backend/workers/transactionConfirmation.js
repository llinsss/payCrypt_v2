import { Worker } from "bullmq";
import db from "../config/database.js";
import { redisConnection } from "../config/redis.js";
import { webhookQueue } from "../queues/webhook.js";

/**
 * Worker to confirm pending transactions by checking on-chain status
 * and updating transaction records accordingly.
 */
export const transactionConfirmationWorker = redisConnection
  ? new Worker(
      "transaction-confirmation",
      async (job) => {
        const { txHash, chain } = job.data;

        console.log(`🔍 Confirming transaction: ${txHash} on ${chain}`);

        try {
          // Fetch all pending transactions with this hash
          const transactions = await db("transactions")
            .where({ tx_hash: txHash, status: "pending" })
            .select("*");

          if (transactions.length === 0) {
            console.log(`⚠️ No pending transactions found for ${txHash}`);
            return;
          }

          // Check on-chain status based on chain type
          const isConfirmed = await checkTransactionStatus(txHash, chain);

          if (isConfirmed) {
            // Update all related transactions to completed
            await db("transactions")
              .where({ tx_hash: txHash, status: "pending" })
              .update({
                status: "completed",
                updated_at: db.fn.now(),
              });

            console.log(`✅ Transaction ${txHash} confirmed and updated`);

            // Send completion notifications and trigger webhooks
            for (const tx of transactions) {
              // Create completion notification
              const user = await db("users").where("id", tx.user_id).first();
              const token = await db("tokens")
                .where("id", tx.token_id)
                .first();

              if (user && token) {
                const notificationBody =
                  tx.type === "debit"
                    ? `Transfer of ${tx.amount} ${token.symbol} to ${tx.to_address} completed`
                    : `Received ${tx.amount} ${token.symbol} from ${tx.from_address}`;

                await db("notifications").insert({
                  user_id: tx.user_id,
                  title: `Transaction ${tx.type === "debit" ? "sent" : "received"}`,
                  body: notificationBody,
                });

                // Trigger webhook for transaction completion
                await webhookQueue.add("trigger-webhook", {
                  event_type: "transaction.completed",
                  user_id: tx.user_id,
                  payload: {
                    transaction_id: tx.id,
                    tx_hash: txHash,
                    type: tx.type,
                    amount: tx.amount,
                    token: token.symbol,
                    status: "completed",
                  },
                });
              }
            }
          } else {
            // Check if transaction has failed on-chain
            const hasFailed = await checkTransactionFailure(txHash, chain);

            if (hasFailed) {
              await db("transactions")
                .where({ tx_hash: txHash, status: "pending" })
                .update({
                  status: "failed",
                  updated_at: db.fn.now(),
                });

              console.log(`❌ Transaction ${txHash} failed on-chain`);

              // Notify users of failure
              for (const tx of transactions) {
                const user = await db("users").where("id", tx.user_id).first();
                const token = await db("tokens")
                  .where("id", tx.token_id)
                  .first();

                if (user && token) {
                  await db("notifications").insert({
                    user_id: tx.user_id,
                    title: "Transaction failed",
                    body: `Transfer of ${tx.amount} ${token.symbol} failed on-chain`,
                  });

                  // Trigger webhook for transaction failure
                  await webhookQueue.add("trigger-webhook", {
                    event_type: "transaction.failed",
                    user_id: tx.user_id,
                    payload: {
                      transaction_id: tx.id,
                      tx_hash: txHash,
                      type: tx.type,
                      amount: tx.amount,
                      token: token.symbol,
                      status: "failed",
                    },
                  });
                }
              }
            } else {
              // Still pending, will retry
              console.log(`⏳ Transaction ${txHash} still pending`);
              throw new Error("Transaction still pending");
            }
          }
        } catch (error) {
          console.error(`⚠️ Error confirming transaction ${txHash}:`, error.message);
          throw error; // Let BullMQ handle retries
        }
      },
      {
        connection: redisConnection,
        limiter: {
          max: 10, // Max 10 jobs
          duration: 1000, // per second
        },
      }
    )
  : null;

/**
 * Check if a transaction is confirmed on-chain
 * @param {string} txHash - Transaction hash
 * @param {string} chain - Chain identifier (starknet, ethereum, etc.)
 * @returns {Promise<boolean>}
 */
async function checkTransactionStatus(txHash, chain) {
  // Import chain-specific providers dynamically
  if (chain === "starknet") {
    const { starknet } = await import("../contracts/chains.js");
    try {
      const receipt = await starknet.provider.getTransactionReceipt(txHash);
      // Check if transaction is accepted on L2 or L1
      return (
        receipt.execution_status === "SUCCEEDED" &&
        (receipt.finality_status === "ACCEPTED_ON_L2" ||
          receipt.finality_status === "ACCEPTED_ON_L1")
      );
    } catch (error) {
      console.error(`Error checking StarkNet tx ${txHash}:`, error.message);
      return false;
    }
  }

  // Add support for other chains (EVM, etc.)
  if (chain === "ethereum" || chain === "polygon" || chain === "bsc") {
    const { ethers } = await import("ethers");
    const { evm } = await import("../contracts/services/evm.js");
    try {
      const provider = evm.getProvider(chain);
      const receipt = await provider.getTransactionReceipt(txHash);
      // Require at least 3 confirmations for EVM chains
      if (receipt && receipt.confirmations >= 3) {
        return receipt.status === 1; // 1 = success, 0 = failed
      }
      return false;
    } catch (error) {
      console.error(`Error checking ${chain} tx ${txHash}:`, error.message);
      return false;
    }
  }

  console.warn(`⚠️ Unsupported chain: ${chain}`);
  return false;
}

/**
 * Check if a transaction has failed on-chain
 * @param {string} txHash - Transaction hash
 * @param {string} chain - Chain identifier
 * @returns {Promise<boolean>}
 */
async function checkTransactionFailure(txHash, chain) {
  if (chain === "starknet") {
    const { starknet } = await import("../contracts/chains.js");
    try {
      const receipt = await starknet.provider.getTransactionReceipt(txHash);
      return receipt.execution_status === "REVERTED";
    } catch (error) {
      // If we can't find the receipt, it might still be pending
      return false;
    }
  }

  if (chain === "ethereum" || chain === "polygon" || chain === "bsc") {
    const { ethers } = await import("ethers");
    const { evm } = await import("../contracts/services/evm.js");
    try {
      const provider = evm.getProvider(chain);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt && receipt.confirmations >= 3) {
        return receipt.status === 0; // 0 = failed
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  return false;
}

if (transactionConfirmationWorker) {
  transactionConfirmationWorker.on("completed", (job) => {
    console.log(`✅ Transaction confirmation job completed: ${job.id}`);
  });

  transactionConfirmationWorker.on("failed", (job, err) => {
    console.error(`❌ Transaction confirmation job failed: ${job?.id}`, err.message);
  });

  console.log("📬 Transaction confirmation worker initialized");
} else {
  console.warn("⚠️ Transaction confirmation worker not available (Redis not connected)");
}
