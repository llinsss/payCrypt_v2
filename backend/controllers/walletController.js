import Wallet from "../models/Wallet.js";
import starknet from "../starknet-contract.js";
import { shortString } from "starknet";
import { from18Decimals, to18Decimals } from "../utils/amount.js";
import Balance from "../models/Balance.js";
import Token from "../models/Token.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import secureRandomString from "../utils/random-string.js";
import redis from "../config/redis.js";
import { NGN_KEY } from "../config/initials.js";
import dotenv from "dotenv";
dotenv.config();

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
    const { receiver_tag, amount, balance_id } = req.body;

    // Fail fast: validate input
    if (!receiver_tag || !amount || !balance_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Parallel fetches (user, recipient, balance)
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

    const transferAmount = Number(amount);
    if (transferAmount > Number(balance.amount))
      return res.status(422).json({ error: "Insufficient wallet balance" });

    const token = await Token.findById(balance.token_id);
    if (!token) return res.status(400).json({ error: "Token not found" });

    if (token.symbol !== "STRK") {
      return res.status(422).json({ error: "Channel inactive" });
    }

    // Blockchain interaction
    const contract = await starknet.getContract();
    const senderTag = shortString.encodeShortString(user.tag);
    const receiverTag = shortString.encodeShortString(receiver_tag);
    const transferValue = to18Decimals(transferAmount).toString();

    const tx = await contract.deposit_to_tag(
      receiverTag,
      senderTag,
      transferValue,
      String(process.env.STARKNET_TOKEN_ADDRESS)
    );

    await starknet.provider.waitForTransaction(tx.transaction_hash);

    if (!tx.transaction_hash) {
      return res.status(422).json({ error: "Failed to transfer" });
    }

    // Prepare common metadata
    const timestamp = new Date();
    const usdPrice = token.price ?? 1;
    const usdValue = transferAmount * usdPrice;
    const reference = secureRandomString(16);

    // Write debit/credit transactions + notifications in parallel
    await Promise.all([
      Transaction.create({
        user_id: user.id,
        status: "completed",
        token_id: balance.token_id,
        chain_id: null,
        reference,
        type: "debit",
        tx_hash: tx.transaction_hash,
        usd_value: usdValue,
        amount: transferAmount,
        timestamp,
        from_address: user.tag,
        to_address: receiver_tag,
        description: "Fund transfer",
        extra: null,
      }),
      Notification.create({
        user_id: user.id,
        title: "Fund transfer",
        body: `You transferred ${transferAmount} ${token.symbol} to ${receiver_tag}`,
      }),
      Transaction.create({
        user_id: recipient.id,
        status: "completed",
        token_id: balance.token_id,
        chain_id: null,
        reference: secureRandomString(16),
        type: "credit",
        tx_hash: tx.transaction_hash,
        usd_value: usdValue,
        amount: transferAmount,
        timestamp,
        from_address: user.tag,
        to_address: receiver_tag,
        description: "Fund received",
        extra: null,
      }),
      Notification.create({
        user_id: recipient.id,
        title: "Fund received",
        body: `You received ${transferAmount} ${token.symbol} from ${user.tag}`,
      }),
    ]);

    return res.json({ data: "success", tx });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getWalletBalance = async (req, res) => {
  try {
    const { id } = req.user;
    const user = await User.findById(id);
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }
    const balances = await Balance.getByUser(user.id);
    const response = [];
    for (const balance of balances) {
      const token = await Token.findById(balance.token_id);

      if (token.symbol === "STRK") {
        const contract = await starknet.getContract();
        const userTag = shortString.encodeShortString(user.tag);

        // bal will likely be a BigInt
        const bal = await contract.get_tag_wallet_balance(
          userTag,
          process.env.STARKNET_TOKEN_ADDRESS
        );

        const balStr = from18Decimals(bal.toString());
        const balBig = from18Decimals(BigInt(bal));

        if (balStr !== balance.amount) {
          const crypto_value = balStr;
          const usdPrice = token.price;
          const usd_value = Number(balBig) * (usdPrice ?? 1);
          const ngnPrice = (await redis.get(NGN_KEY)) ?? 1600;
          const ngn_value = usd_value * ngnPrice;

          await Balance.update(balance.id, {
            amount: crypto_value,
            usd_value,
          });
          response.push({
            symbol: token.symbol,
            name: token.name,
            crypto_value,
            usd_value,
            ngn_value,
          });
        }
      } else {
        response.push({
          symbol: token.symbol,
          name: token.name,
          crypto_value: 0,
          usd_value: 0,
          ngn_value: 0,
        });
      }
    }
    return res.json(response);
  } catch (error) {
    console.error("Wallet balance error:", error);
    return res.status(500).json({ error: error.message });
  }
};
