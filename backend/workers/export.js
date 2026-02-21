import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { processExportJob } from "../queues/export.js";

export const exportWorker = redisConnection
  ? new Worker("export", processExportJob, {
      connection: redisConnection,
      concurrency: 2, // Limit concurrent export jobs
    })
  : null;

if (exportWorker) {
  exportWorker.on("completed", (job) => {
    console.log(`✅ Export worker completed job ${job.id}`);
  });
  exportWorker.on("failed", (job, err) => {
    console.error(`💥 Export worker failed job ${job.id}:`, err.message);
  });
} else {
  console.warn("⚠️ Export worker not available (Redis not connected)");
}
