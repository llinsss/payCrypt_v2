import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { buildJobOptions, attachQueueDepthAlert } from "./queueDefaults.js";

/**
 * Queue for processing transaction confirmations
 */
export const transactionConfirmationQueue = redisConnection
  ? new Queue("transaction-confirmation", {
      connection: redisConnection,
      defaultJobOptions: buildJobOptions({
        attempts: 10, // Retry up to 10 times
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800 },
      }),
    })
  : null;
attachRedisErrorAlert(transactionConfirmationQueue, "transaction-confirmation-queue");
attachQueueDepthAlert(transactionConfirmationQueue, "transaction-confirmation-queue");

if (transactionConfirmationQueue) {
  console.log("📬 Transaction confirmation queue initialized");
} else {
  console.warn("⚠️ Transaction confirmation queue not available (Redis not connected)");
}
