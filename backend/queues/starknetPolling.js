import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const starknetPollingQueue = redisConnection
  ? new Queue("starknet-polling", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2880,
        backoff: {
          type: "exponential",
          delay: 30000,
        },
        removeOnComplete: true,
        removeOnFail: false,
        timeout: 60000,
      },
    })
  : null;

if (starknetPollingQueue) {
  starknetPollingQueue.on("waiting", (job) =>
    console.log(`⏳ Starknet polling job ${job.id} waiting in queue`)
  );
} else {
  console.warn("⚠️ Starknet polling queue not available (Redis not connected)");
}
