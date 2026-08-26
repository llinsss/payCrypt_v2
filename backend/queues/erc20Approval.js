import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";

export const erc20ApprovalQueue = redisConnection
  ? new Queue("erc20-approval", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          age: 86400,
          count: 1000,
        },
        removeOnFail: {
          age: 604800,
        },
      },
    })
  : null;

attachRedisErrorAlert(erc20ApprovalQueue, "erc20-approval-queue");

if (erc20ApprovalQueue) {
  console.log("🔐 ERC-20 approval queue initialized");
} else {
  console.warn("⚠️ ERC-20 approval queue not available (Redis not connected)");
}
