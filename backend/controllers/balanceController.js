import Balance from "../models/Balance.js";
import Token from "../models/Token.js";
import starknet from "../contracts/starknet-contract.js";
import base from "../contracts/base-contract.js";
import lisk from "../contracts/lisk-contract.js";
import flow from "../contracts/flow-contract.js";
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
  try {
    const tokens = await Token.getAll();
    const balances = [];

    for (const token of tokens) {
      let address = null;

      // ---- STARKNET ----
      if (token.symbol === "STRK") {
        const starknet_contract = await starknet.getContract();
        const starknet_tx = await starknet_contract.register_tag(tag);
        await starknet.provider.waitForTransaction(
          starknet_tx.transaction_hash
        );

        const starknet_generated_address =
          await starknet_contract.get_tag_wallet_address(tag);
        address = `0x${BigInt(starknet_generated_address).toString(16)}`;
      }

      // ---- LISK ----
      else if (token.symbol === "LSK") {
        const lisk_tx = await lisk.registerTag(
          tag,
          lisk.LISK_CONFIG.accountAddress
        );
        await lisk_tx.wait(); // ensure tx confirmed
        address = await lisk.getUserChainAddress(tag);
      }

      // ---- BASE ----
      else if (token.symbol === "BASE") {
        const base_tx = await base.registerTag(
          tag,
          base.BASE_CONFIG.accountAddress
        );
        await base_tx.wait();
        address = await base.getUserChainAddress(tag);
      }

      // ---- FLOW ----
      else if (token.symbol === "FLOW") {
        const flow_tx = await flow.registerTag(
          tag,
          flow.FLOW_CONFIG.accountAddress
        );
        await flow_tx.wait();
        address = await flow.getUserChainAddress(tag);
      }

      // ---- DEFAULT (Fallback) ----
      if (!address) {
        console.warn(`⚠️ No address generated for token: ${token.symbol}`);
        continue;
      }

      // ---- CREATE BALANCE ENTRY ----
      const balance = await Balance.create({
        user_id,
        token_id: token.id,
        address,
      });

      balances.push(balance);
    }

    return balances;
  } catch (error) {
    console.error("❌ createUserBalance failed:", error);
    throw error; 
  }
};
