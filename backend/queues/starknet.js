import { Queue } from "bullmq";
import queueConfig from "./index.js";

export const starknetQueue = new Queue("starknet-transactions", queueConfig);
starknetQueue.on("waiting", (jobId) =>
  console.log(`⏳ Starknet Job ${jobId} waiting in queue`)
);
starknetQueue.on("active", (job) =>
  console.log(`⚙️ Starknet Processing job ${job.id}`)
);
starknetQueue.on("failed", (job, err) =>
  console.error(`💥 Starknet Job ${job.id} failed:`, err.message)
);
starknetQueue.on("completed", (job) =>
  console.log(`✅ Starknet Job ${job.id} completed successfully`)
);
