import { Queue, QueueScheduler } from "bullmq";
import { redisConnection } from "../config/redis.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { buildJobOptions, attachQueueDepthAlert } from "./queueDefaults.js";

export const contractIndexerQueue = redisConnection
  ? new Queue("contract-indexer", {
      connection: redisConnection,
      defaultJobOptions: buildJobOptions({
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400 },
      }),
    })
  : null;

export const contractIndexerScheduler = redisConnection
  ? new QueueScheduler("contract-indexer", {
      connection: redisConnection,
    })
  : null;

attachRedisErrorAlert(contractIndexerQueue, "contract-indexer-queue");
attachQueueDepthAlert(contractIndexerQueue, "contract-indexer-queue");

if (contractIndexerQueue) {
  console.log("📑 Contract indexer queue initialized");

  (async () => {
    try {
      const chains = ["base", "lisk", "flow", "u2u"];
      for (const chain of chains) {
        await contractIndexerQueue.add(
          `index-${chain}`,
          { chain },
          {
            repeat: {
              pattern: "*/5 * * * *",
            },
            jobId: `index-${chain}-recurring`,
          }
        );
      }
    } catch (error) {
      console.error("Failed to set up indexer schedule:", error.message);
    }
  })();
} else {
  console.warn("⚠️ Contract indexer queue not available (Redis not connected)");
}
