import { Queue, Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import ExportService from "../services/ExportService.js";

export const exportQueue = redisConnection
  ? new Queue("transaction-export", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    })
  : null;

export const exportWorker =
  redisConnection &&
  new Worker(
    "transaction-export",
    async (job) => {
      return await ExportService.processQueuedExport(job);
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

if (exportWorker) {
  exportWorker.on("completed", (job) =>
    console.log(`✅ Export worker completed job ${job.id}`)
  );
  exportWorker.on("failed", (job, err) =>
    console.error(`💥 Export worker failed job ${job?.id}:`, err.message)
  );
}
