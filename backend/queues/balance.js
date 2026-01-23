import { Queue } from "bullmq";
import queueConfig from "./index.js";

export const balanceQueue = queueConfig ? new Queue("balance-setup", queueConfig) : null;

if (balanceQueue) {
  balanceQueue.on("waiting", (job) =>
    console.log(`⏳ Balance Job ${JSON.stringify(job)} waiting in queue`)
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
} else {
  console.warn("⚠️ Balance queue not available (Redis not connected)");
}
