import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const auditCleanupQueue = redisConnection
  ? new Queue("audit-cleanup", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    })
  : null;

if (auditCleanupQueue) {
  auditCleanupQueue.on("waiting", (job) =>
    console.log(`⏳ Audit cleanup job ${job.id} waiting in queue`)
  );

  if (!process.env.SKIP_AUDIT_CLEANUP_SCHEDULE) {
    auditCleanupQueue.add(
      "cleanup-old-logs",
      {},
      {
        repeat: {
          pattern: "0 2 * * *",
        },
        jobId: "audit-cleanup-daily",
      }
    );
  }
} else {
  console.warn("⚠️ Audit cleanup queue not available (Redis not connected)");
}
