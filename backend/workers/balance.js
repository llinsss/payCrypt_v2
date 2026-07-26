import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { createUserBalance } from "../controllers/balanceController.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { instrumentBullWorker } from "../observability/sentry.js";

export const balanceWorker = redisConnection ? new Worker(
  "balance-setup",
  async (job) => {
    const { user_id, tag } = job.data;
    console.log(`⚙️ Processing balance setup for user ${user_id}`);
    await createUserBalance(user_id, tag);
    return { success: true, user_id };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
) : null;
attachRedisErrorAlert(balanceWorker, "balance-setup-worker");

if (balanceWorker) instrumentBullWorker(balanceWorker, "balance-setup");

if (balanceWorker) {
  balanceWorker.on("completed", (job) => {
    console.log(`✅ Balance worker completed job ${job.id}`);
  });
  balanceWorker.on("failed", (job, err) => {
    console.error(`💥 Balance worker failed job ${job.id}:`, err.message);
  });
} else {
  console.warn("⚠️ Balance worker not available (Redis not connected)");
}
