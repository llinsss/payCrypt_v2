import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

export const balanceQueue = new Queue("balance-setup", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // retry failed jobs up to 3 times
    backoff: {
      type: "exponential",
      delay: 5000, // retry after 5s, then 10s, etc.
    },
    removeOnComplete: 50, // keep only the last 50 completed jobs
    removeOnFail: false, // keep failed jobs for inspection
  },
});
balanceQueue.on("waiting", (jobId) =>
  console.log(`⏳ Job ${jobId} waiting in queue`)
);
balanceQueue.on("active", (job) => console.log(`⚙️ Processing job ${job.id}`));
balanceQueue.on("failed", (job, err) =>
  console.error(`💥 Job ${job.id} failed:`, err.message)
);
balanceQueue.on("completed", (job) =>
  console.log(`✅ Job ${job.id} completed successfully`)
);
