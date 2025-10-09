import { Worker } from "bullmq";
import redis from "../config/redis.js";
import { createUserBalance } from "../controllers/balanceController.js";

const balanceWorker = new Worker(
  "balance-setup",
  async (job) => {
    const { user_id, tag } = job.data;
    console.log(`⚙️ Processing balance setup for user ${user_id}`);
    await createUserBalance(user_id, tag);
    return { success: true, user_id };
  },
  {
    connection: redis,
    concurrency: 5, // number of jobs processed in parallel
  }
);

// Worker event listeners
balanceWorker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed for user ${job.data.user_id}`);
});

balanceWorker.on("failed", (job, err) => {
  console.error(`💥 Job ${job.id} failed: ${err.message}`);
});

export default balanceWorker;
