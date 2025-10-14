import { shortString } from "starknet";
import redis from "../config/redis.js";
import starknet from "../contracts/starknet-contract.js";
import base from "../contracts/base-contract.js";
import lisk from "../contracts/lisk-contract.js";
import u2u from "../contracts/u2u-contract.js";
import flow from "../contracts/flow-contract.js";
import { sleep } from "../utils/sleep.js";
import User from "../models/User.js";
import Balance from "../models/Balance.js";
import Token from "../models/Token.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import { from18Decimals, to18Decimals } from "../utils/amount.js";
import secureRandomString from "../utils/random-string.js";

const POLL_INTERVAL = 10_000; // 10 seconds
const LOCK_KEY = "balance_poller_lock";
const LOCK_TTL = 15_000; // 15 seconds (auto-expire in case of crash)
const MAX_RETRIES = 3;
const CONCURRENCY_LIMIT = 5;
const NGN_KEY = "ngn_rate";

/** Simple concurrency limiter */
const chunk = (arr, size) =>
  arr.reduce(
    (acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
    []
  );

/** Retry helper */
const withRetry = async (fn, retries = MAX_RETRIES, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`⚠️ Retry ${i + 1}/${retries} failed: ${err.message}`);
      await sleep(delay * (i + 1)); // exponential backoff
    }
  }
};

/** Chain-specific balance readers */
const chainReaders = {
  STRK: async (userTag, token) => {
    const contract = await starknet.getContract();
    const tag = shortString.encodeShortString(userTag).toString();
    const bal = await contract.get_tag_wallet_balance(
      tag,
      String(process.env.STARKNET_TOKEN_ADDRESS)
    );
    return from18Decimals(bal.toString());
  },
  LSK: async (userTag, token) => {
    const bal = await lisk.contract.getTagBalance(userTag);
    return Number(bal) / Number(10n ** BigInt(token.decimals));
  },
  BASE: async (userTag, token) => {
    const bal = await base.contract.getTagBalance(userTag);
    return Number(bal) / Number(10n ** BigInt(token.decimals));
  },
  FLOW: async (userTag, token) => {
    const bal = await flow.contract.getTagBalance(userTag);
    return Number(bal) / Number(10n ** BigInt(token.decimals));
  },
  U2U: async (userTag, token) => {
    const bal = await u2u.contract.getTagBalance(userTag);
    return Number(bal) / Number(10n ** BigInt(token.decimals));
  },
};

/** Main poller loop */
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
        console.log("ℹ️ No balances found, waiting...");
        await sleep(POLL_INTERVAL);
        continue;
      }

      const tokens = await Promise.allSettled(
        balances.map((b) => Token.findById(b.token_id))
      );
      const tokenMap = new Map(
        tokens
          .filter((r) => r.status === "fulfilled" && r.value)
          .map((r) => [r.value.id, r.value])
      );

      const balanceChunks = chunk(balances, CONCURRENCY_LIMIT);

      for (const batch of balanceChunks) {
        await Promise.all(
          batch.map(async (balance) => {
            const token = tokenMap.get(balance.token_id);
            if (!token || !chainReaders[token.symbol]) return;

            try {
              const user = await User.findById(balance.user_id);
              if (!user) return;

              const cryptoValue = await withRetry(() =>
                chainReaders[token.symbol](user.tag, token)
              );

              if (Number(cryptoValue) > Number(balance.amount)) {
                const depositAmount =
                  Number(cryptoValue) - Number(balance.amount);
                const usdValue = token.price * depositAmount;
                const ngnValue = usdValue * ngnPrice;

                await Balance.update(balance.id, {
                  amount: cryptoValue,
                  usd_value: token.price * cryptoValue,
                });

                await Transaction.create({
                  user_id: user.id,
                  status: "completed",
                  token_id: token.id,
                  reference: secureRandomString(16),
                  type: "credit",
                  tx_hash: balance.address,
                  usd_value: usdValue,
                  amount: depositAmount,
                  timestamp: new Date(),
                  description: "Deposit",
                });

                await Notification.create({
                  user_id: user.id,
                  title: "Deposit",
                  body: `Deposit of ${depositAmount} ${token.symbol} received`,
                });

                console.log(
                  `💰 Deposit detected: +${depositAmount} ${token.symbol} for ${user.tag}`
                );
              }
            } catch (err) {
              console.error(
                `❌ Error updating ${token?.symbol ?? "?"} balance for user ${
                  balance.user_id
                }:`,
                err.message
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
