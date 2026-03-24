import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

/**
 * Queue for processing transaction confirmations
 */
export const transactionConfirmationQueue = redisConnection
  ? new Queue("transaction-confirmation", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 10, // Retry up to 10 times
        backoff: {
          type: "exponential",
          delay: 5000, // Start with 5 seconds, exponentially increase
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 604800, // Keep failed jobs for 7 days
        },
      },
    })
  : null;

if (transactionConfirmationQueue) {
  console.log("📬 Transaction confirmation queue initialized");
} else {
  console.warn("⚠️ Transaction confirmation queue not available (Redis not connected)");
}
