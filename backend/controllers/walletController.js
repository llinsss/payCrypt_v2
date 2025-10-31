import { shortString } from "starknet";
import {
  User,
  Balance,
  Token,
  Transaction,
  Notification,
  Wallet,
} from "../models/index.js";
import { from18Decimals, to18Decimals } from "../utils/amount.js";
import secureRandomString from "../utils/random-string.js";
import redis from "../config/redis.js";
import { NGN_KEY } from "../config/initials.js";
import { ethers } from "ethers";
import * as contract from "../contracts/index.js";
import * as evm from "../contracts/services/evm.js";
import * as starknet from "../contracts/services/starknet.js";

export const getWalletByUserId = async (req, res) => {
  try {
    const { id } = req.user;
    const wallet = await Wallet.getByUserId(id);
    if (!wallet) {
      return res.status(400).json({ error: "Wallet not found" });
    }
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getWalletById = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = await Wallet.findById(id);

    if (!wallet) {
      return res.status(400).json({ error: "Wallet not found" });
    }

    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = await Wallet.findById(id);

    if (!wallet) {
      return res.status(400).json({ error: "Wallet not found" });
    }

    // Only allow wallet owner to update
    if (wallet.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedWallet = await Wallet.update(id, {
      auto_convert_threshold: req.body.auto_convert_threshold,
    });
    res.json(updatedWallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = await Wallet.findById(id);

    if (!wallet) {
      return res.status(400).json({ error: "Wallet not found" });
    }

    // Only allow wallet owner to delete
    if (wallet.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // await Wallet.delete(id);
    res.json({ message: "Wallet deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const send_to_tag = async (req, res) => {
  try {
    const { id } = req.user;
    const { receiver_tag, amount: _amount, balance_id } = req.body;

    const amount = Number(_amount);
    if (!receiver_tag || !amount || !balance_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [user, recipient, balance] = await Promise.all([
      User.findById(id),
      User.findByTag(receiver_tag),
      Balance.findById(balance_id),
    ]);

    if (!user) return res.status(400).json({ error: "User not found" });
    if (!recipient)
      return res.status(400).json({ error: "Recipient not found" });
    if (recipient.id === user.id)
      return res.status(400).json({ error: "Cannot send to self" });
    if (!balance) return res.status(400).json({ error: "Balance not found" });
    if (balance.user_id !== id)
      return res.status(403).json({ error: "Unauthorized" });

    if (amount > Number(balance.amount)) {
      return res.status(422).json({ error: "Insufficient wallet balance" });
    }

    const token = await Token.findById(balance.token_id);
    if (!token) return res.status(400).json({ error: "Token not found" });

    const timestamp = new Date();
    const usdPrice = token.price ?? 1;
    const usdValue = amount * usdPrice;
    const reference = secureRandomString(16);
    const chain = contract.chains[token.symbol];
    const sender_tag = user.tag;
    const payload = {
      chain,
      sender_tag,
      receiver_tag,
      amount,
    };
    const txHash = await contract.send_via_tag(payload);

    if (!txHash) {
      return res.status(422).json({ error: "Failed to transfer" });
    }

    // ====== ⛓ Common database updates ======
    await Promise.all([
      Transaction.create({
        user_id: user.id,
        status: "completed",
        token_id: balance.token_id,
        chain_id: token.id,
        reference,
        type: "debit",
        tx_hash: txHash,
        usd_value: usdValue,
        amount: amount,
        timestamp,
        from_address: sender_tag,
        to_address: receiver_tag,
        description: "Fund transfer",
      }),
      Notification.create({
        user_id: user.id,
        title: "Fund transfer",
        body: `You transferred ${amount} ${token.symbol} to ${receiver_tag}`,
      }),
      Transaction.create({
        user_id: recipient.id,
        status: "completed",
        token_id: balance.token_id,
        chain_id: token.chain_id,
        reference: secureRandomString(16),
        type: "credit",
        tx_hash: txHash,
        usd_value: usdValue,
        amount: amount,
        timestamp,
        from_address: sender_tag,
        to_address: receiver_tag,
        description: "Fund received",
      }),
      Notification.create({
        user_id: recipient.id,
        title: "Fund received",
        body: `You received ${amount} ${token.symbol} from ${sender_tag}`,
      }),
    ]);

    return res.json({ data: "success", txHash });
  } catch (error) {
    console.error("Transfer Error:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const send_to_wallet = async (req, res) => {
  try {
    const { id } = req.user;
    const { receiver_address, amount: _amount, balance_id } = req.body;
    const amount = Number(_amount);
    if (!amount || !balance_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [user, recipient, balance] = await Promise.all([
      User.findById(id),
      Balance.findByAddress(receiver_address),
      Balance.findById(balance_id),
    ]);

    if (!user) return res.status(400).json({ error: "User not found" });
    if (recipient && recipient.id === user.id)
      return res.status(400).json({ error: "Cannot send to self" });
    if (!balance) return res.status(400).json({ error: "Balance not found" });
    if (balance.user_id !== id)
      return res.status(403).json({ error: "Unauthorized" });
    if (amount > Number(balance.amount)) {
      return res.status(422).json({ error: "Insufficient wallet balance" });
    }

    const token = await Token.findById(balance.token_id);
    if (!token) return res.status(400).json({ error: "Token not found" });

    const timestamp = new Date();
    const usdPrice = token.price ?? 1;
    const usdValue = amount * usdPrice;
    const reference = secureRandomString(16);
    const chain = contract.chains[token.symbol];
    const sender_tag = user.tag;
    const sender_address = balance.address;
    const payload = {
      chain,
      sender_tag,
      receiver_address,
      amount,
    };
    const txHash = await contract.send_via_wallet(payload);

    if (!txHash) {
      return res.status(422).json({ error: "Failed to transfer" });
    }

    // ====== ⛓ Common database updates ======
    await Promise.all([
      Transaction.create({
        user_id: user.id,
        status: "completed",
        token_id: balance.token_id,
        chain_id: token.id,
        reference,
        type: "debit",
        tx_hash: txHash,
        usd_value: usdValue,
        amount: amount,
        timestamp,
        from_address: sender_address,
        to_address: receiver_address,
        description: "Fund transfer",
      }),
      Notification.create({
        user_id: user.id,
        title: "Fund transfer",
        body: `You transferred ${amount} ${token.symbol} to ${receiver_address}`,
      }),
    ]);
    if (recipient) {
      await Promise.all([
        Transaction.create({
          user_id: recipient.id,
          status: "completed",
          token_id: balance.token_id,
          chain_id: token.chain_id,
          reference: secureRandomString(16),
          type: "credit",
          tx_hash: txHash,
          usd_value: usdValue,
          amount: amount,
          timestamp,
          from_address: sender_address,
          to_address: receiver_address,
          description: "Fund received",
        }),
        Notification.create({
          user_id: recipient.id,
          title: "Fund received",
          body: `You received ${amount} ${token.symbol} from ${sender_address}`,
        }),
      ]);
    }

    return res.json({ data: "success", txHash });
  } catch (error) {
    console.error("Transfer Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
