import { starknetQueue } from "../queues/starknet.js";
import redis from "../config/redis.js";
import { starknet } from "../contracts/chains.js";
const contract = await starknet.getContract();

const CONTRACT_ADDRESS = contract.address;
const REDIS_KEY = "starknet:lastProcessedBlock";
const POLL_INTERVAL = 10_000; // 10 seconds
const CHUNK_SIZE = 100; // events batch size

/**
 * Fetch the current StarkNet block number
 */
const getBlockNumber = async () => {
  try {
    return await starknet.provider.getBlockNumber();
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
    const res = await starknet.provider.getEvents({
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
 * Decode known event types.
 *
 * #616: events now carry a stable `operation_id` (emitted as a `#[key]`
 * field, so it lands in `keys[1]`/`keys[2]` as a low/high u256 pair rather
 * than in `data`) plus `tag`/`wallet`/`recipient` context needed to uniquely
 * reconcile a deposit/withdrawal off-chain.
 */
const decodeEvent = (rawEvent) => {
  const data = rawEvent.data;
  const keys = rawEvent.keys || [];
  const txHash = rawEvent.transaction_hash;

  const operationId =
    keys.length >= 3
      ? starknet.utils
          .uint256ToBigInt({ low: keys[1], high: keys[2] })
          .toString()
      : null;

  // DepositReceived data: tag, wallet, sender, amount.low, amount.high, token
  if (data.length === 6) {
    const amount = starknet.utils.uint256ToBigInt({
      low: data[3],
      high: data[4],
    });
    return {
      type: "DepositReceived",
      operationId,
      tag: data[0],
      wallet: data[1],
      sender: data[2],
      recipient: data[1],
      amount: amount.toString(),
      token: data[5],
      txHash,
    };
  }

  // WithdrawalCompleted data: tag, wallet, sender, recipient, amount.low, amount.high, token
  if (data.length === 7) {
    const amount = starknet.utils.uint256ToBigInt({
      low: data[4],
      high: data[5],
    });
    return {
      type: "WithdrawalCompleted",
      operationId,
      tag: data[0],
      wallet: data[1],
      sender: data[2],
      recipient: data[3],
      amount: amount.toString(),
      token: data[6],
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
