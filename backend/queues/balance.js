import { Queue } from "bullmq";
import queueConfig from "./index.js";

export const balanceQueue = new Queue("balance-setup", queueConfig);
balanceQueue.on("waiting", (jobId) =>
  console.log(`⏳ Balance Job ${jobId} waiting in queue`)
);
balanceQueue.on("active", (job) =>
  console.log(`⚙️ Balance Processing job ${job.id}`)
);
balanceQueue.on("failed", (job, err) =>
  console.error(`💥 Balance Job ${job.id} failed:`, err.message)
);
balanceQueue.on("completed", (job) =>
  console.log(`✅ Balance Job ${job.id} completed successfully`)
);
