import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import db from "../config/database.js";
import redis from "../config/redis.js";
import Transaction from "../models/Transaction.js";
import { getEvmProvider } from "../contracts/index.js";
import { ethers } from "ethers";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";

const TRANSFER_EVENT_SIGNATURE = ethers.id("Transfer(address,address,uint256)");
const TAG_PAYMENT_EVENT_SIGNATURE = ethers.id("TagPayment(string,string,uint256,address)");
const BLOCK_RANGE = 1000;

export const contractIndexerWorker = redisConnection
  ? new Worker(
      "contract-indexer",
      async (job) => {
        const { chain } = job.data;
        console.log(`🔍 Starting contract indexer for ${chain}`);

        try {
          const lastIndexedBlockKey = `indexer:lastBlock:${chain}`;
          const lastIndexedBlockStr = await redis.get(lastIndexedBlockKey);
          let lastIndexedBlock = lastIndexedBlockStr ? parseInt(lastIndexedBlockStr, 10) : 0;

          const provider = getEvmProvider(chain);
          const currentBlock = await provider.getBlockNumber();

          console.log(`Chain: ${chain}, Last indexed: ${lastIndexedBlock}, Current: ${currentBlock}`);

          if (lastIndexedBlock === 0) {
            lastIndexedBlock = Math.max(0, currentBlock - 1000);
          }

          const contractAddress = process.env[`${chain.toUpperCase()}_CONTRACT_ADDRESS`];
          if (!contractAddress) {
            throw new Error(`Contract address not configured for ${chain}`);
          }

          const fromBlock = lastIndexedBlock;
          const toBlock = Math.min(fromBlock + BLOCK_RANGE, currentBlock);

          console.log(`Scanning blocks ${fromBlock} to ${toBlock} on ${chain}`);

          const eventFilter = {
            address: contractAddress,
            topics: [[TRANSFER_EVENT_SIGNATURE, TAG_PAYMENT_EVENT_SIGNATURE]],
            fromBlock,
            toBlock,
          };

          const logs = await provider.getLogs(eventFilter);
          console.log(`Found ${logs.length} events on ${chain}`);

          const transactionsToUpsert = [];

          for (const log of logs) {
            try {
              if (log.topics[0] === TRANSFER_EVENT_SIGNATURE) {
                const parsed = ethers.AbiCoder.defaultAbiCoder().decode(
                  ["address", "address", "uint256"],
                  log.data
                );

                const txHash = log.transactionHash;
                const amount = parsed[2];

                const existing = await db("transactions")
                  .where({ tx_hash: txHash })
                  .first();

                if (!existing) {
                  transactionsToUpsert.push({
                    tx_hash: txHash,
                    status: "completed",
                    type: "transfer",
                    amount: ethers.formatUnits(amount, 18),
                    chain_id: chain,
                    created_at: db.fn.now(),
                    updated_at: db.fn.now(),
                  });
                }
              }
            } catch (error) {
              console.warn(`Failed to parse event from ${log.transactionHash}:`, error.message);
            }
          }

          if (transactionsToUpsert.length > 0) {
            for (const tx of transactionsToUpsert) {
              await db("transactions")
                .insert(tx)
                .onConflict("tx_hash")
                .merge()
                .catch(err => {
                  console.warn(`Failed to upsert transaction ${tx.tx_hash}:`, err.message);
                });
            }
            console.log(`✅ Upserted ${transactionsToUpsert.length} transactions for ${chain}`);
          }

          await redis.set(lastIndexedBlockKey, toBlock.toString());

          return { chain, blocksScanned: toBlock - fromBlock, transactionsFound: logs.length };
        } catch (error) {
          console.error(`❌ Indexer failed for ${chain}:`, error.message);
          throw error;
        }
      },
      { connection: redisConnection }
    )
  : null;

attachRedisErrorAlert(contractIndexerWorker, "contract-indexer-worker");

if (contractIndexerWorker) {
  console.log("🔐 Contract indexer worker started");
} else {
  console.warn("⚠️ Contract indexer worker not available");
}
