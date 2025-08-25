import Wallet from "../models/Wallet.js";
import starknet from "../starknet-contract.js";
import { shortString } from "starknet";
import { cryptoPrice, from18Decimals, to18Decimals } from "../utils/amount.js";
import Balance from "../models/Balance.js";
import Token from "../models/Token.js";
import User from "../models/User.js";

export const getWalletByUserId = async (req, res) => {
  try {
    const { id } = req.user;
    const wallet = await Wallet.getByUserId(id);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
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
      return res.status(404).json({ error: "Wallet not found" });
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
      return res.status(404).json({ error: "Wallet not found" });
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
      return res.status(404).json({ error: "Wallet not found" });
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

export const deposit = async (req, res) => {
  try {
    const { id } = req.user;
    const { receiver_tag, amount, balance_id } = req.body;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const balance = await Balance.findById(balance_id);
    if (!balance) {
      return res.status(404).json({ error: "Balance not found" });
    }
    if (Number(amount) > Number(balance.amount)) {
      return res.status(422).json({ error: "Insufficient wallet balance" });
    }
    const token = await Token.findById(balance.token_id);
    if (!token) {
      return res.status(404).json({ error: "Token not found" });
    }

    // Only allow balance owner to delete
    if (balance.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    if (token.symbol === "STRK") {
      const contract = await starknet.getContract();
      const senderTag = shortString.encodeShortString(user.tag);
      const receiverTag = shortString.encodeShortString(receiver_tag);
      const _amount = to18Decimals(amount);
      const tx = await contract.deposit_to_tag(
        receiverTag,
        senderTag,
        _amount,
        "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
      );
      await starknet.provider.waitForTransaction(tx.transaction_hash);
      res.json({ data: "success", tx });
    } else {
      return res.status(422).json({ error: "Channel inactive" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getWalletBalance = async (req, res) => {
  try {
    const { id } = req.user;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const balance = await Balance.findByUserIdAndTokenId(user.id, 4);
    if (!balance) {
      return res.status(404).json({ error: "Balance not found" });
    }

    const token = await Token.findById(balance.token_id);
    if (!token) {
      return res.status(404).json({ error: "Token not found" });
    }

    if (balance.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (token.symbol === "STRK") {
      const contract = await starknet.getContract();
      const userTag = shortString.encodeShortString(user.tag);

      // bal will likely be a BigInt
      const bal = await contract.get_tag_wallet_balance(
        userTag,
        "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
      );

      const balStr = from18Decimals(bal.toString());
      const balBig = from18Decimals(BigInt(bal));

      if (balStr !== balance.amount) {
        const usdPrice = await cryptoPrice(token.symbol);

        await Balance.update(balance.id, {
          amount: balStr,
          usd_value: Number(balBig) * (usdPrice ?? 1),
        });
      }

      return res.json({
        success: true,
        balance: balStr,
      });
    }
    return res.status(422).json({ error: "Channel inactive" });
  } catch (error) {
    console.error("Wallet balance error:", error);
    return res.status(500).json({ error: error.message });
  }
};
