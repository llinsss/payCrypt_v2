import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { buildJobOptions, attachQueueDepthAlert } from "./queueDefaults.js";

export const auditCleanupQueue = redisConnection
  ? new Queue("audit-cleanup", {
      connection: redisConnection,
      defaultJobOptions: buildJobOptions({
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 30 }, // one/day cron; 30 runs is plenty of history
        removeOnFail: { count: 100 },
      }),
    })
  : null;
attachRedisErrorAlert(auditCleanupQueue, "audit-cleanup-queue");
attachQueueDepthAlert(auditCleanupQueue, "audit-cleanup-queue");

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
