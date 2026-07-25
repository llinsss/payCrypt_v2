import { Worker } from "bullmq";
import db from "../config/database.js";
import redis, { redisConnection } from "../config/redis.js";
import { webhookQueue } from "../queues/webhook.js";

const POLLING_INTERVAL = 30000;
const MAX_POLLING_DURATION = 24 * 60 * 60 * 1000;

export const starknetPollingWorker = redisConnection
  ? new Worker(
      "starknet-polling",
      async (job) => {
        const { txHash, chain } = job.data;

        console.log(`🔄 Polling Starknet transaction: ${txHash}`);

        try {
          const { starknet } = await import("../contracts/chains.js");
          const provider = starknet.getStarknetChain().provider;

          const receipt = await provider.getTransactionReceipt(txHash);
          const executionStatus = receipt.execution_status;
          const finality = receipt.finality_status;

          console.log(`📋 Transaction ${txHash}: execution=${executionStatus}, finality=${finality}`);

          const transaction = await db("transactions")
            .where("tx_hash", txHash)
            .where("status", "pending")
            .first();

          if (!transaction) {
            console.log(`⚠️ No pending transaction found for ${txHash}`);
            return;
          }

          // State machine: RECEIVED → PENDING → ACCEPTED_ON_L2 → ACCEPTED_ON_L1
          if (executionStatus === "REVERTED") {
            await handleRejection(txHash, transaction);
            return;
          }

          if (finality === "ACCEPTED_ON_L2" || finality === "ACCEPTED_ON_L1") {
            if (executionStatus === "SUCCEEDED") {
              await handleConfirmation(txHash, transaction);
              return;
            }
          }

          // Still pending, will retry on next poll
          throw new Error(`Transaction still in ${finality || executionStatus} state`);
        } catch (error) {
          console.error(`⚠️ Error polling transaction ${txHash}:`, error.message);
          throw error;
        }
      },
      {
        connection: redisConnection,
        limiter: {
          max: 20,
          duration: 1000,
        },
      }
    )
  : null;

/**
 * Handle confirmed transaction: update status, credit balance, fire webhook
 */
async function handleConfirmation(txHash, transaction) {
  console.log(`✅ Transaction ${txHash} confirmed (ACCEPTED_ON_L2+)`);

  await db("transactions")
    .where("tx_hash", txHash)
    .update({
      status: "completed",
      updated_at: db.fn.now(),
    });

  const user = await db("users").where("id", transaction.user_id).first();
  const token = await db("tokens").where("id", transaction.token_id).first();

  if (user && token) {
    const notificationBody =
      transaction.type === "debit"
        ? `Transfer of ${transaction.amount} ${token.symbol} to ${transaction.to_address} confirmed`
        : `Received ${transaction.amount} ${token.symbol} from ${transaction.from_address}`;

    await db("notifications").insert({
      user_id: transaction.user_id,
      title: "Transaction confirmed",
      body: notificationBody,
    });

    if (webhookQueue) {
      await webhookQueue.add("trigger-webhook", {
        event_type: "transaction.confirmed",
        user_id: transaction.user_id,
        payload: {
          transaction_id: transaction.id,
          tx_hash: txHash,
          type: transaction.type,
          amount: transaction.amount,
          token: token.symbol,
          status: "confirmed",
        },
      });
    }
  }
}

/**
 * Handle rejected transaction: mark failed, reverse balance hold, notify user
 */
async function handleRejection(txHash, transaction) {
  console.log(`❌ Transaction ${txHash} rejected (REVERTED)`);

  await db("transactions")
    .where("tx_hash", txHash)
    .update({
      status: "failed",
      updated_at: db.fn.now(),
    });

  const user = await db("users").where("id", transaction.user_id).first();
  const token = await db("tokens").where("id", transaction.token_id).first();
  const balance = await db("balances")
    .where({ user_id: transaction.user_id, token_id: transaction.token_id })
    .first();

  if (user && token && balance) {
    if (transaction.type === "debit") {
      await db("balances")
        .where("id", balance.id)
        .increment("amount", transaction.amount);
    }

    await db("notifications").insert({
      user_id: transaction.user_id,
      title: "Transaction failed",
      body: `Transfer of ${transaction.amount} ${token.symbol} rejected on-chain`,
    });

    if (webhookQueue) {
      await webhookQueue.add("trigger-webhook", {
        event_type: "transaction.failed",
        user_id: transaction.user_id,
        payload: {
          transaction_id: transaction.id,
          tx_hash: txHash,
          type: transaction.type,
          amount: transaction.amount,
          token: token.symbol,
          status: "failed",
        },
      });
    }
  }
}

if (starknetPollingWorker) {
  starknetPollingWorker.on("completed", (job) => {
    console.log(`✅ Starknet polling job completed: ${job.id}`);
  });

  starknetPollingWorker.on("failed", (job, err) => {
    console.error(`❌ Starknet polling job failed: ${job?.id}`, err.message);
  });

  console.log("📬 Starknet polling worker initialized");
} else {
  console.warn("⚠️ Starknet polling worker not available (Redis not connected)");
}
