import { Worker } from "bullmq";
import db from "../config/database.js";
import redis, { redisConnection } from "../config/redis.js";
import { NGN_KEY } from "../config/initials.js";
import secureRandomString from "../utils/random-string.js";

export const starknetWorker = redisConnection ? new Worker(
  "starknet-transactions",
  async (job) => {
    const event = job.data;

    console.log(`📥 Processing StarkNet event: ${event.type}`);

    if (event.type === "DepositReceived") {
      const { sender, recipient, amount, token, txHash, timestamp } = event;

      const transaction = await db("transactions")
        .where("tx_hash", txHash)
        .first();
      if (transaction) return;

      const balance = await db("balances").where("address", recipient).first();
      if (!balance) return;

      const _token = await db("tokens").where("id", balance.token_id).first();
      if (!_token) return;

      const user = await db("users").where("id", balance.user_id).first();
      if (!user) return;

      const amountDecimal = Number(amount) / 1e18;
      const crypto_value = amountDecimal;
      const usd_value = Number(crypto_value) * (_token.price ?? 1);
      const ngnPrice = Number((await redis.get(NGN_KEY)) ?? 1600);
      const ngn_value = usd_value * ngnPrice;

      // Update balance table
      await db("balances")
        .where({
          id: balance.id,
        })
        .update({
          amount: balance.amount + crypto_value,
          usd_value: balance.usd_value + usd_value,
          updated_at: db.fn.now(),
        });

      // Record transaction
      await db("transactions").insert({
        user_id: user.id,
        token_id: _token.id,
        chain_id: _token.id,
        type: "credit",
        status: "completed",
        reference: secureRandomString(16),
        tx_hash: txHash,
        amount: crypto_value,
        usd_value,
        from_address: sender,
        to_address: recipient,

        timestamp,
        description: "Deposit received on StarkNet",
        extra: JSON.stringify(event),
      });
      //   add notification
      await db("notifications").insert({
        user_id: user.id,
        title: "Deposit",
        body: `Deposit of ${crypto_value} ${_token.symbol} received`,
      });
    }

    if (event.type === "WithdrawalCompleted") {
      const { sender, amount, token, txHash, timestamp } = event;

      const transaction = await db("transactions")
        .where("tx_hash", txHash)
        .first();
      if (transaction) return;

      const balance = await db("balances").where("address", sender).first();
      if (!balance) return;

      const _token = await db("tokens").where("id", balance.token_id).first();
      if (!_token) return;

      const user = await db("users").where("id", balance.user_id).first();
      if (!user) return;

      const amountDecimal = Number(amount) / 1e18;
      const crypto_value = amountDecimal;
      const usd_value = Number(crypto_value) * (_token.price ?? 1);
      const ngnPrice = Number((await redis.get(NGN_KEY)) ?? 1600);
      const ngn_value = usd_value * ngnPrice;

      await db("balances")
        .where({ user_id: user.id, token_id: _token.id })
        .decrement("amount", amountDecimal);

      // Record transaction
      await db("transactions").insert({
        user_id: user.id,
        token_id: _token.id,
        chain_id: _token.id,
        type: "debit",
        status: "completed",
        reference: secureRandomString(16),
        tx_hash: txHash,
        amount: crypto_value,
        usd_value,
        from_address: sender,
        to_address: null,
        timestamp,
        description: "Withdrawal completed on StarkNet",
        extra: JSON.stringify(event),
      });
      //   add notification
      await db("notifications").insert({
        user_id: user.id,
        title: "Withdrawal",

        body: `Withdrawal of ${crypto_value} ${_token.symbol} completed`,
      });
    }
  },
  {
    connection: redisConnection,
  }
) : null;

if (starknetWorker) {
  starknetWorker.on("completed", (job) => {
    console.log(`✅ Starknet job completed: ${job.id}`);
  });
  starknetWorker.on("failed", (job, err) => {
    console.error(`❌ Starknet job failed: ${job.id}`, err);
  });
  console.log("📬 Starknet worker initialized");
} else {
  console.warn("⚠️ Starknet worker not available (Redis not connected)");
}
