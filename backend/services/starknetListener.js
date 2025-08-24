import starknet from "./../starknet-contract.js";
import Transaction from "../models/Transaction.js";
import Balance from "../models/Balance.js";
import User from "../models/User.js";
import secureRandomString from "../utils/random-string.js";
import { hash } from "starknet";
import { BigNumber } from "bignumber.js";
import db from "../config/database.js";

function normalizeHex(addr) {
  return new BigNumber(addr).toString(16);
}

function eqHex(a, b) {
  return new BigNumber(a).eq(new BigNumber(b));
}

const DEPOSIT_RECEIVED_SELECTOR = hash.getSelectorFromName("DepositReceived");

const decodeDepositEvent = (event) => {
  const [sender, recipient, low, high, token] = event.data;

  const amount = BigInt(low) + (BigInt(high) << 128n);

  return {
    sender,
    recipient,
    amount: amount.toString(),
    token,
  };
};

const listenForDeposits = async (block_number = null) => {
  if (block_number) {
    const blk = await starknet.provider.getBlockWithTxs(block_number);

    for (const tx of blk.transactions) {
      const receipt = await starknet.provider.getTransactionReceipt(
        tx.transaction_hash
      );
      const exist_in_db = await db("transactions")
        .where("tx_hash", tx.transaction_hash)
        .first();
      if (exist_in_db) continue;

      if (!receipt.events) continue;

      for (const ev of receipt.events) {
        // only process DepositReceived
        if (
          eqHex(ev.from_address, starknet.STARKNET_CONFIG.contractAddress) &&
          eqHex(ev.keys[0], DEPOSIT_RECEIVED_SELECTOR)
        ) {
          const decoded = decodeDepositEvent(ev);

          console.log("💰 DepositReceived:", decoded);

          // === persist into DB ===
          const balance = await Balance.findByAddress(decoded.recipient);
          if (balance) {
            const user = await User.findById(balance.user_id);
            if (user) {
              const update_bal = await db("balances")
                .where({ id: balance.id })
                .increment("amount", Number(decoded.amount))
                .update({ updated_at: db.fn.now() });

              const create_tx = await Transaction.create({
                user_id: user.id,
                status: "completed",
                token_id: balance.token_id,
                chain_id: null,
                reference: secureRandomString(16),
                type: "credit",
                tx_hash: tx.transaction_hash,
                usd_value: decoded.amount,
                amount: decoded.amount,
                timestamp: new Date(),
                from_address: decoded.sender,
                to_address: decoded.recipient,
                description: "Deposit received",
                extra: decoded.token,
              });
            }
          }
        }
      }
    }
  } else {
    const latestBlock = await starknet.provider.getBlock("latest");
    let lastBlockNumber = latestBlock.block_number;

    console.log(
      `🔍 Listening for DepositReceived events from block ${lastBlockNumber}...`
    );

    try {
      const block = await starknet.provider.getBlock("latest");
      if (block.block_number <= lastBlockNumber) return;

      for (let bn = lastBlockNumber + 1; bn <= block.block_number; bn++) {
        const blk = await starknet.provider.getBlockWithTxs(bn);

        for (const tx of blk.transactions) {
          const receipt = await starknet.provider.getTransactionReceipt(
            tx.transaction_hash
          );
          const exist_in_db = await db("transactions")
            .where("tx_hash", tx.transaction_hash)
            .first();
          if (exist_in_db) continue;

          if (!receipt.events) continue;

          for (const ev of receipt.events) {
            if (
              eqHex(
                ev.from_address,
                starknet.STARKNET_CONFIG.contractAddress
              ) &&
              eqHex(ev.keys[0], DEPOSIT_RECEIVED_SELECTOR)
            ) {
              const decoded = decodeDepositEvent(ev);

              console.log("💰 DepositReceived:", decoded);

              const balance = await Balance.findByAddress(decoded.recipient);
              if (balance) {
                const user = await User.findById(balance.user_id);
                if (user) {
                  const update_bal = await Balance.update(balance.id, {
                    amount: Number(amount) + Number(decoded.amount),
                  });
                  const create_tx = await Transaction.create({
                    user_id: user.id,
                    status: "completed",
                    token_id: balance.token_id,
                    chain_id: null,
                    reference: secureRandomString(16),
                    type: "credit",
                    tx_hash: tx.transaction_hash,
                    usd_value: Number(decoded.amount),
                    amount: Number(decoded.amount),
                    timestamp: new Date(),
                    from_address: decoded.sender,
                    to_address: decoded.recipient,
                    description: "Deposit received",
                    extra: decoded.token,
                  });
                }
              }
            }
          }
        }
      }

      lastBlockNumber = block.block_number;
    } catch (err) {
      console.error("⚠️ Error in listenForDeposits:", err);
    }
  }
};

export default listenForDeposits;
