import Balance from "../models/Balance.js";
import Token from "../models/Token.js";
import starknet from "../contracts/starknet-contract.js";
import u2u from "../contracts/u2u-contract.js";
import lisk from "../contracts/lisk-contract.js";
import flow from "../contracts/flow-contract.js";
import base from "../contracts/base-contract.js";
import redis from "../config/redis.js";
import { NGN_KEY } from "../config/initials.js";

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

  // --- Helper: Extract TagRegistered event address ---
  const extractTagAddress = (receipt, contract) => {
    if (!receipt?.logs?.length) return null;

    for (const log of receipt.logs) {
      try {
        const event = contract.interface.parseLog(log);
        if (event?.name === "TagRegistered") return event.args?.[1] ?? null;
      } catch {
        continue; // ignore irrelevant logs
      }
    }
    return null;
  };

  // --- Reusable chain handler factory ---
  const makeEvmHandler = (chain) => async () => {
    const { contract, CONFIG } = chain;
    const tx = await contract.registerTag(tag, CONFIG.accountAddress);
    const receipt = await tx.wait();
    return extractTagAddress(receipt, contract);
  };

  // --- Chain Handlers Map ---
  const chainHandlers = {
    STRK: async () => {
      const { contract, provider } = await starknet.getContract();
      const tx = await contract.register_tag(tag);
      await provider.waitForTransaction(tx.transaction_hash);
      const newTag = await contract.get_tag_wallet_address(tag);
      return newTag ? `0x${BigInt(newTag).toString(16)}` : null;
    },
    LSK: makeEvmHandler(lisk),
    BASE: makeEvmHandler(base),
    FLOW: makeEvmHandler(flow),
    U2U: makeEvmHandler(u2u),
  };

  // --- Process all tokens concurrently ---
  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const handler = chainHandlers[token.symbol];
      if (!handler) {
        console.warn(`⚠️ Skipping unsupported token: ${token.symbol}`);
        return null;
      }

      try {
        const address = await handler();
        if (!address) throw new Error("No address generated");
        return Balance.create({ user_id, token_id: token.id, address });
      } catch (err) {
        console.error(`❌ ${token.symbol} registration failed:`, err.message);
        return null;
      }
    })
  );
  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
};

