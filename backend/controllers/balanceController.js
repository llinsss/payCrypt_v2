import Balance from "../models/Balance.js";
import Token from "../models/Token.js";
import starknet from "../contracts/starknet-contract.js";
import u2u from "../contracts/u2u-contract.js";
import lisk from "../contracts/lisk-contract.js";
import flow from "../contracts/flow-contract.js";
import base from "../contracts/base-contract.js";
import redis from "../config/redis.js";
import { NGN_KEY } from "../config/initials.js";
import { sleep } from "../utils/sleep.js";
import db from "../config/database.js";

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

/**
 * Retry helper with exponential backoff
 */
const withRetry = async (fn, retries = 3, delay = 2000) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const wait = delay * attempt;
      console.warn(
        `⚠️ Retry ${attempt}/${retries} after ${wait}ms: ${err.message}`
      );
      if (attempt >= retries) throw err;
      await sleep(wait);
    }
  }
};

/**
 * Extract TagRegistered event address
 */
const extractTagAddress = (receipt, contract) => {
  if (!receipt?.logs?.length) return null;
  for (const log of receipt.logs) {
    try {
      const event = contract.interface.parseLog(log);
      if (event?.name === "TagRegistered") {
        return event.args?.wallet || event.args?.[1] || null;
      }
    } catch {}
  }
  return null;
};

/**
 * Create user balance across all chains
 */
export const createUserBalance = async (user_id, tag) => {
  const user = await db("users").where("id", user_id).first();
  if (!user) null;
  const redisKey = `user_balance:${user_id}:${tag}`;
  const cached = await redis.get(redisKey);

  // Prevent duplicate concurrent executions
  if (cached === "processing") {
    console.log(`⚠️ Tag creation already in progress for ${tag}`);
    return [];
  }

  await redis.setEx(redisKey, 300, "processing"); // lock for 5 minutes

  try {
    const tokens = await Token.getAll();

    /**
     * Generic EVM handler factory
     */
    const makeEvmHandler = (chain) => async (tag) => {
      const { contract, config } = chain;
      if (!contract || !config?.accountAddress) {
        throw new Error(`Invalid chain config: ${config?.nodeUrl}`);
      }

      console.log(`\n🔗 ${config.nodeUrl}: Registering tag "${tag}"...`);
      const tx = await contract.registerTag(tag, config.accountAddress);
      console.log(`📤 ${config.nodeUrl} Tx Hash: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(
        `✅ ${config.nodeUrl} Confirmed in Block: ${receipt.blockNumber}`
      );

      const tagAddress = extractTagAddress(receipt, contract);
      if (!tagAddress)
        console.warn(`⚠️ No TagRegistered event found on ${config.nodeUrl}`);
      return tagAddress;
    };

    /**
     * Define supported chains
     */
    const evmChains = { BASE: base, LSK: lisk, FLOW: flow, U2U: u2u };
    const evmHandlers = Object.fromEntries(
      Object.entries(evmChains).map(([symbol, chain]) => [
        symbol,
        makeEvmHandler(chain),
      ])
    );

    /**
     * Chain handlers (EVM + StarkNet)
     */
    const chainHandlers = {
      STRK: async (tag) => {
        const contract = await starknet.getContract();
        if (!contract) throw new Error("❌ StarkNet contract not initialized");

        console.log(`\n🔗 STRK: Registering tag "${tag}"...`);
        const tx = await contract.register_tag(tag);
        console.log("📤 STRK Tx sent:", tx.transaction_hash);

        await starknet.provider.waitForTransaction(tx.transaction_hash);
        console.log("✅ STRK Tx confirmed");

        const newTag = await contract.get_tag_wallet_address(tag);
        return newTag && newTag !== "0x0"
          ? `0x${BigInt(newTag).toString(16)}`
          : null;
      },
      ...evmHandlers,
    };

    /**
     * Process all tokens concurrently with safe retries
     */
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
        const handler = chainHandlers[token.symbol];
        if (!handler) {
          console.warn(`⚠️ Skipping unsupported token: ${token.symbol}`);
          return null;
        }

        try {
          const address = await handler(tag);
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

    const successful = results
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);

    await redis.setEx(redisKey, 3600, JSON.stringify(successful)); // cache for 1 hour
    return successful;
  } catch (err) {
    console.error("❌ createUserBalance failed:", err.message);
    throw err;
  } finally {
    await redis.del(redisKey); // clear processing lock
  }
};
