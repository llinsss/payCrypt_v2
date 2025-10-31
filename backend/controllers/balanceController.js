import redis from "../config/redis.js";
import { NGN_KEY } from "../config/initials.js";
import db from "../config/database.js";
import { sleep } from "../utils/sleep.js";
import { User, Balance, Token } from "../models/index.js";
import * as contract from "../contracts/index.js";
import * as evm from "../contracts/services/evm.js";
import * as starknet from "../contracts/services/starknet.js";

const chunk = (arr, size) =>
  arr.reduce(
    (acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
    []
  );

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

export const createBalance = async (req, res) => {
  try {
    const balanceData = {
      ...req.body,
      user_id: req.user.id,
    };

    const balance = await Balance.create(balanceData);
    res.status(201).json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBalances = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const balances = await Balance.getAll(
      Number.parseInt(limit),
      Number.parseInt(offset)
    );
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBalanceByUser = async (req, res) => {
  try {
    const { id } = req.user;
    const ngnPrice = Number((await redis.get(NGN_KEY)) ?? 1600);
    const balances = await Balance.getByUser(id);
    let response = [];
    for (const balance of balances) {
      const ngn_value = Number(balance.usd_value) * ngnPrice;
      response.push({ ...balance, ngn_value });
    }
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBalanceById = async (req, res) => {
  try {
    const { id } = req.params;
    const balance = await Balance.findById(id);

    if (!balance) {
      return res.status(400).json({ error: "Balance not found" });
    }
    // Only allow balance owner to view
    if (balance.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const balance = await Balance.findById(id);

    if (!balance) {
      return res.status(400).json({ error: "Balance not found" });
    }

    // Only allow balance owner to update
    if (balance.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedBalance = await Balance.update(id, req.body);
    res.json(updatedBalance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const balance = await Balance.findById(id);

    if (!balance) {
      return res.status(400).json({ error: "Balance not found" });
    }

    // Only allow balance owner to delete
    if (balance.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Balance.delete(id);
    res.json({ message: "Balance deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createUserBalance = async (user_id, tag) => {
  const tokens = await Token.getAll();
  const user = await db("users").where("id", user_id).first();
  if (!user) null;
  // --- Process all tokens concurrently ---
  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const balance = await db("balances")
        .where("user_id", user.id)
        .where("token_id", token.id)
        .first();
      if (balance && balance.address) {
        console.warn(`⚠️ Balance already exists: ${token.symbol}`);
        null;
      }

      try {
        const chain = contract.chains[token.symbol];
        if (!chain) throw new Error("No chain found");
        const address = await contract.register(chain, tag);
        if (!address) throw new Error("No address generated");
        return await Balance.create({
          user_id: user.id,
          token_id: token.id,
          address,
        });
      } catch (err) {
        console.error(`❌ ${token.symbol} registration failed:`, err.message);
        return null;
      }
    })
  );
  // --- Return only successful balances ---
  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
};

export const updateUserBalance = async (req, res) => {
  const POLL_INTERVAL = 10_000;
  const LOCK_KEY = `balance_poller_lock:${req.user.id}`;
  const LOCK_TTL = 15_000;
  const MAX_RETRIES = 3;
  const CONCURRENCY_LIMIT = 5;
  const NGN_KEY = "ngn_rate";
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
      const user = await User.findById(req.user.id);
      if (!user) continue;
      const balances = await Balance.getAll();
      if (!balances.length) {
        await sleep(POLL_INTERVAL);
        continue;
      }
      const tokenIds = [...new Set(balances.map((b) => b.token_id))];
      const tokens = await Token.findByIds(tokenIds);
      const tokenMap = new Map(tokens.map((t) => [t.id, t]));
      for (const batch of chunk(balances, CONCURRENCY_LIMIT)) {
        await Promise.all(
          batch.map(async (balance) => {
            const token = tokenMap.get(balance.token_id);
            if (!token) return;
            const chain = contract.chains[token.symbol];
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
              if (Math.abs(onchainValue - dbValue) < 1e-10) return;
              await Balance.update(balance.id, {
                amount: onchainValue,
                usd_value: token.price * onchainValue,
              });
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
