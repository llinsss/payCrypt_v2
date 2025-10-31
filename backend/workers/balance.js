import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { createUserBalance } from "../controllers/balanceController.js";

export const balanceWorker = new Worker(
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
);
