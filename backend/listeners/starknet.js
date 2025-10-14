import { starknetQueue } from "../queues/starknet.js";
import { getContract, utils } from "../starknet-contract.js";
import redis from "../config/redis.js";

const contract = getContract();
const { provider } = contract;

const CONTRACT_ADDRESS = contract.address;
const REDIS_KEY = "starknet:lastProcessedBlock";
const POLL_INTERVAL = 10_000; // 10 seconds
const CHUNK_SIZE = 100; // events batch size

/**
 * Fetch the current StarkNet block number
 */
const getBlockNumber = async () => {
  try {
    return await provider.getBlockNumber();
  } catch (err) {
    console.error("⚠️ Failed to get block number:", err.message);
    return null;
  }
};

/**
 * Safely fetch contract events between blocks
 */
const getEventsInRange = async (from, to) => {
  try {
    const res = await provider.getEvents({
      from_block: { block_number: from },
      to_block: { block_number: to },
      address: CONTRACT_ADDRESS,
      keys: [],
      chunk_size: CHUNK_SIZE,
    });
    return res.events || [];
  } catch (err) {
    console.error("⚠️ getEvents error:", err.message);
    return [];
  }
};

/**
 * Decode known event types
 */
const decodeEvent = (rawEvent) => {
  const data = rawEvent.data;
  const txHash = rawEvent.transaction_hash;

  // Determine event type by data length or your ABI pattern
  // DepositReceived: sender, recipient, amount.low, amount.high, token
  if (data.length === 5) {
    const amount = utils.uint256ToBigInt({
      low: data[2],
      high: data[3],
    });
    return {
      type: "DepositReceived",
      sender: data[0],
      recipient: data[1],
      amount: amount.toString(),
      token: data[4],
      txHash,
    };
  }

  // WithdrawalCompleted: sender, amount.low, amount.high, token
  if (data.length === 4) {
    const amount = utils.uint256ToBigInt({
      low: data[1],
      high: data[2],
    });
    return {
      type: "WithdrawalCompleted",
      sender: data[0],
      amount: amount.toString(),
      token: data[3],
      txHash,
    };
  }

  return null;
};

/**
 * Process and enqueue decoded events
 */
const processEvents = async (events) => {
  for (const e of events) {
    const decoded = decodeEvent(e);
    if (!decoded) continue;

    await starknetQueue.add("handleEvent", {
      ...decoded,
      timestamp: Date.now(),
    });

    console.log(`📤 Queued ${decoded.type} | tx: ${decoded.txHash}`);
  }
};

/**
 * Main listener loop
 */
export const startStarknetListener = async () => {
  console.log("🔍 Starting StarkNet event listener...");

  let lastBlock = parseInt((await redis.get(REDIS_KEY)) || "0", 10);
  const latestBlock = await getBlockNumber();

  // Start fresh if no previous block stored
  if (!lastBlock || lastBlock === 0) {
    lastBlock = latestBlock - 1;
    await redis.set(REDIS_KEY, lastBlock);
  }

  console.log(`🚀 Listening from block ${lastBlock} (current: ${latestBlock})`);

  setInterval(async () => {
    try {
      const currentBlock = await getBlockNumber();
      if (!currentBlock || currentBlock <= lastBlock) return;

      console.log(`🧱 New block range: ${lastBlock + 1} → ${currentBlock}`);

      const events = await getEventsInRange(lastBlock, currentBlock);
      if (events.length > 0) {
        console.log(`📦 Found ${events.length} events`);
        await processEvents(events);
      }

      lastBlock = currentBlock;
      await redis.set(REDIS_KEY, lastBlock);
    } catch (err) {
      console.error("⚠️ Listener error:", err);
    }
  }, POLL_INTERVAL);
};
