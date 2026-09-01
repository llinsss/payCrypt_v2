import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { buildJobOptions, attachQueueDepthAlert } from "./queueDefaults.js";

export const starknetPollingQueue = redisConnection
  ? new Queue("starknet-polling", {
      connection: redisConnection,
      defaultJobOptions: buildJobOptions({
        attempts: 2880,
        backoff: { type: "exponential", delay: 30000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
        timeout: 60000,
      }),
    })
  : null;
attachRedisErrorAlert(starknetPollingQueue, "starknet-polling-queue");
attachQueueDepthAlert(starknetPollingQueue, "starknet-polling-queue");

if (starknetPollingQueue) {
  starknetPollingQueue.on("waiting", (job) =>
    console.log(`⏳ Starknet polling job ${job.id} waiting in queue`)
  );
} else {
  console.warn("⚠️ Starknet polling queue not available (Redis not connected)");
}
