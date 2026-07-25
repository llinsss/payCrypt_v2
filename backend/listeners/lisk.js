import { ethers } from "ethers";
import redis from "../config/redis.js";
import { sleep } from "../utils/sleep.js";
import { Balance, User, Token, Transaction, Notification } from "../models/index.js";
import secureRandomString from "../utils/random-string.js";

const LISK_RPC_URL = process.env.LISK_RPC_URL || "https://rpc.sepolia-api.lisk.com";
const LISK_WS_URL = process.env.LISK_WS_URL || "wss://rpc.sepolia-api.lisk.com/ws";
const TAG_ROUTER_ADDRESS = process.env.LISK_TAG_ROUTER_ADDRESS;
const REDIS_KEY = "lisk:lastProcessedBlock";
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_BLOCKS_PER_QUERY = 100;

const provider = new ethers.JsonRpcProvider(LISK_RPC_URL);

// Standard ERC20 Transfer event signature
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daf6a5d7a83c505a6b712817c2dc1491b23";

export const startLiskListener = async () => {
  console.log("🚀 Starting Lisk event listener...");

  while (true) {
    try {
      const lastBlock = await redis.get(REDIS_KEY);
      const currentBlock = await provider.getBlockNumber();

      if (!lastBlock) {
        // First run - start from current block
        await redis.set(REDIS_KEY, currentBlock.toString());
        await sleep(POLL_INTERVAL);
        continue;
      }

      const fromBlock = Math.max(Number(lastBlock) + 1, currentBlock - MAX_BLOCKS_PER_QUERY);
      const toBlock = currentBlock;

      if (fromBlock > toBlock) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      console.log(`🔍 Scanning Lisk blocks ${fromBlock} to ${toBlock}`);

      // Query for all Transfer events to tagged addresses
      const filter = {
        topics: [TRANSFER_TOPIC],
        fromBlock,
        toBlock,
      };

      const logs = await provider.getLogs(filter);
      console.log(`📬 Found ${logs.length} transfer events`);

      // Process each transfer event
      for (const log of logs) {
        await processTransferEvent(log);
      }

      // Update last processed block
      await redis.set(REDIS_KEY, toBlock.toString());

      await sleep(POLL_INTERVAL);
    } catch (error) {
      console.error("❌ Lisk listener error:", error.message);
      await sleep(POLL_INTERVAL);
    }
  }
};

async function processTransferEvent(log) {
  try {
    // Decode the Transfer event: Transfer(from, to, value)
    // topics[1] = from (indexed), topics[2] = to (indexed), data = value
    const toAddress = ethers.AbiCoder.defaultAbiCoder().decode(
      ["address"],
      log.topics[2]
    )[0].toLowerCase();

    const value = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint256"],
      log.data
    )[0];

    // Find all tags with this address
    const users = await User.query().where("wallet_address", toAddress).orWhere("receiving_address", toAddress);

    for (const user of users) {
      if (!user.tag) continue;

      console.log(`💰 Incoming transfer detected for tag: ${user.tag}`);

      // Find matching balance record
      const tokenAddress = log.address.toLowerCase();
      const token = await Token.query().where("contract_address", tokenAddress).first();

      if (!token) {
        console.warn(`⚠️ Token not found for address: ${tokenAddress}`);
        continue;
      }

      const balance = await Balance.query()
        .where("user_id", user.id)
        .where("token_id", token.id)
        .first();

      if (balance) {
        const amountInUnits = ethers.formatUnits(value, token.decimals || 18);

        // Create transaction record
        const transaction = await Transaction.create({
          user_id: user.id,
          type: "incoming_transfer",
          token_id: token.id,
          amount: amountInUnits,
          from_address: log.topics[1],
          to_address: toAddress,
          chain: "lisk",
          status: "confirmed",
          tx_hash: log.transactionHash,
          block_number: log.blockNumber,
        });

        console.log(`✅ Transaction recorded: ${transaction.id}`);

        // Send notification to user
        await Notification.create({
          user_id: user.id,
          type: "incoming_transfer",
          title: "Incoming Transfer Received",
          message: `You received ${amountInUnits} ${token.symbol} on Lisk`,
          data: {
            transaction_id: transaction.id,
            amount: amountInUnits,
            token: token.symbol,
          },
          is_read: false,
        });

        // Fire webhook if configured
        const webhooks = await user.webhooks();
        for (const webhook of webhooks) {
          try {
            await fetch(webhook.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "incoming_transfer",
                transaction_id: transaction.id,
                user_tag: user.tag,
                amount: amountInUnits,
                token: token.symbol,
                chain: "lisk",
                timestamp: new Date().toISOString(),
              }),
            });
          } catch (err) {
            console.warn(`⚠️ Webhook delivery failed: ${err.message}`);
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Error processing transfer event:", error.message);
  }
}
