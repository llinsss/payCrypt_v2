import { Worker } from "bullmq";
import db from "../config/database.js";
import { redisConnection } from "../config/redis.js";

const BATCH_SIZE = 1000;
const RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "90");

export const auditCleanupWorker = redisConnection
  ? new Worker(
      "audit-cleanup",
      async (job) => {
        console.log(`🧹 Starting audit log cleanup (retention: ${RETENTION_DAYS} days)`);

        try {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

          let totalDeleted = 0;
          let batchDeleted = 0;

          do {
            batchDeleted = await db("audit_logs")
              .where("created_at", "<", cutoffDate)
              .limit(BATCH_SIZE)
              .del();

            totalDeleted += batchDeleted;
            console.log(`🗑️ Deleted batch of ${batchDeleted} audit logs (total: ${totalDeleted})`);
          } while (batchDeleted === BATCH_SIZE);

          console.log(`✅ Audit cleanup completed: ${totalDeleted} records deleted`);
          return { deleted: totalDeleted, cutoffDate };
        } catch (error) {
          console.error(`❌ Audit cleanup failed:`, error.message);
          throw error;
        }
      },
      {
        connection: redisConnection,
      }
    )
  : null;

if (auditCleanupWorker) {
  auditCleanupWorker.on("completed", (job) => {
    console.log(`✅ Audit cleanup job completed: ${job.id}`);
  });

  auditCleanupWorker.on("failed", (job, err) => {
    console.error(`❌ Audit cleanup job failed: ${job?.id}`, err.message);
  });

  console.log("📬 Audit cleanup worker initialized");
} else {
  console.warn("⚠️ Audit cleanup worker not available (Redis not connected)");
}
