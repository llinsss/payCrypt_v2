import { Queue } from "bullmq";
import queueConfig from "./index.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { attachQueueDepthAlert } from "./queueDefaults.js";

export const starknetQueue = queueConfig ? new Queue("starknet-transactions", queueConfig) : null;
attachRedisErrorAlert(starknetQueue, "starknet-transactions-queue");
attachQueueDepthAlert(starknetQueue, "starknet-transactions-queue");

if (starknetQueue) {
  starknetQueue.on("waiting", (job) =>
    console.log(`⏳ Starknet Job ${JSON.stringify(job)} waiting in queue`)
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
} else {
  console.warn("⚠️ Starknet queue not available (Redis not connected)");
}
