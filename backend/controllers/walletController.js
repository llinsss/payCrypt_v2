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

/* --- unchanged code above --- */

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
    const reference = secureRandomString(16); // shared reference
    const chain = contract.chains[token.symbol];
    const sender_tag = user.tag;

    const payload = { chain, sender_tag, receiver_tag, amount };
    const txHash = await contract.send_via_tag(payload);

    if (!txHash) {
      return res.status(422).json({ error: "Failed to transfer" });
    }

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
        amount,
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
        reference, // FIX: same reference
        type: "credit",
        tx_hash: txHash,
        usd_value: usdValue,
        amount,
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

/* ---------- SAME FIX BELOW ---------- */

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
    const usdValue = amount * (token.price ?? 1);
    const reference = secureRandomString(16); // shared
    const chain = contract.chains[token.symbol];
    const sender_tag = user.tag;
    const sender_address = balance.address;

    const payload = { chain, sender_tag, receiver_address, amount };
    const txHash = await contract.send_via_wallet(payload);

    if (!txHash) {
      return res.status(422).json({ error: "Failed to transfer" });
    }

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
        amount,
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
          reference, // FIX
          type: "credit",
          tx_hash: txHash,
          usd_value: usdValue,
          amount,
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