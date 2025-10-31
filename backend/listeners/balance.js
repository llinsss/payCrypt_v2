import redis from "../config/redis.js";
import { sleep } from "../utils/sleep.js";
import {
  User,
  Balance,
  Token,
  Transaction,
  Notification,
} from "../models/index.js";
import secureRandomString from "../utils/random-string.js";
import * as evm from "../contracts/services/evm.js";
import * as starknet from "../contracts/services/starknet.js";
import { chains } from "../contracts/index.js";

const POLL_INTERVAL = 10_000;
const LOCK_KEY = "balance_poller_lock";
const LOCK_TTL = 15_000;
const MAX_RETRIES = 3;
const CONCURRENCY_LIMIT = 5000;
const NGN_KEY = "ngn_rate";

// simple chunker
const chunk = (arr, size) =>
  arr.reduce(
    (acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
    []
  );

// generic retry
const withRetry = async (fn, retries = MAX_RETRIES, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`⚠️ Retry ${i + 1}/${retries} failed: ${err.message}`);
      await sleep(delay * (i + 1));
    }
  }
};

export const startBalancePoller = async () => {
  console.log("🚀 Starting balance poller...");

  while (true) {
    const lock = await redis.set(LOCK_KEY, "locked", {
      NX: true,
      PX: LOCK_TTL,
    });
    if (!lock) {
      console.log("⏳ Another poller is running, skipping this cycle...");
      await sleep(POLL_INTERVAL);
      continue;
    }

    try {
      const ngnPrice = Number((await redis.get(NGN_KEY)) ?? 1600);
      const balances = await Balance.getAll();
      if (!balances.length) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      // Preload tokens once
      const tokenIds = [...new Set(balances.map((b) => b.token_id))];
      const tokens = await Token.findByIds(tokenIds);
      const tokenMap = new Map(tokens.map((t) => [t.id, t]));

      // Preload users once
      const userIds = [...new Set(balances.map((b) => b.user_id))];
      const users = await User.findByIds(userIds);
      const userMap = new Map(users.map((u) => [u.id, u]));

      // Process in batches
      for (const batch of chunk(balances, CONCURRENCY_LIMIT)) {
        await Promise.all(
          batch.map(async (balance) => {
            const token = tokenMap.get(balance.token_id);
            if (!token) return;
            const user = userMap.get(balance.user_id);
            if (!user) return;
            const chain = chains[token.symbol];
            try {
              const onchainValue = await withRetry(() =>
                chain == "starknet"
                  ? starknet.getTagBalance(user.tag)
                  : evm.getTagBalance(chain, user.tag)
              );

              const dbValue = Number(balance.amount);
              console.log(
                `Chain: ${chain} | DB Bal: ${dbValue} | Onchain Bal: ${onchainValue} | Tag: ${user.tag}`
              );
              if (Number.isNaN(onchainValue)) return;

              // Skip identical balances
              if (Math.abs(onchainValue - dbValue) < 1e-10) return;

              await Balance.update(balance.id, {
                amount: onchainValue,
                usd_value: token.price * onchainValue,
              });
              // Calculate difference
              // const diff = onchainValue - dbValue;
              // const absDiff = Math.abs(diff);
              // const usdValue = absDiff * token.price;
              // const ngnValue = usdValue * ngnPrice;
              // const now = new Date();

              // const txType = diff > 0 ? "credit" : "debit";
              // const description = diff > 0 ? "Deposit" : "Withdrawal";
              // const symbol = token.symbol;

              // Record transaction
              // await Transaction.create({
              //   user_id: user.id,
              //   token_id: token.id,
              //   status: "completed",
              //   reference: secureRandomString(16),
              //   type: txType,
              //   tx_hash: balance.address,
              //   usd_value: usdValue,
              //   amount: absDiff,
              //   timestamp: now,
              //   description,
              // });

              // Notification (lightweight)
              // await Notification.create({
              //   user_id: user.id,
              //   title: description,
              //   body: `${description} of ${absDiff} ${symbol} ${
              //     diff > 0 ? "received" : "completed"
              //   }`,
              // });

              // console.log(
              //   diff > 0
              //     ? `💰 Deposit: +${absDiff} ${symbol} for ${user.tag}`
              //     : `💸 Withdrawal: -${absDiff} ${symbol} for ${user.tag}`
              // );
            } catch (err) {
              console.warn(
                `❌ Poll error for ${user?.tag || "unknown"} (${
                  token?.symbol || "?"
                }): ${err.message}`
              );
            }
          })
        );
      }

      console.log("✅ Polling cycle complete.");
    } catch (err) {
      console.error("💥 Poller error:", err.message);
    } finally {
      await redis.del(LOCK_KEY);
      await sleep(POLL_INTERVAL);
    }
  }
};
