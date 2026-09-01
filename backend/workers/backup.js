import { Worker, Queue } from "bullmq";
import * as Sentry from "@sentry/node";
import { redisConnection } from "../config/redis.js";
import { runBackup } from "../scripts/backup.js";

// ========== Queue ==========

export const backupQueue = redisConnection
  ? new Queue("database-backup", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: 30,
        removeOnFail: 30,
      },
    })
  : null;

// ========== Worker ==========

export const backupWorker = redisConnection
  ? new Worker(
      "database-backup",
      async (job) => {
        console.log(`🗄️ Database backup worker: starting job ${job.id}...`);

        const result = await runBackup();

        return {
          filename: result.filename,
          encrypted: result.encrypted,
          uploadedToS3: result.uploadedToS3,
          prunedCount: result.deletedBackups.length,
        };
      },
      {
        connection: redisConnection,
        concurrency: 1,
        lockDuration: 10 * 60 * 1000, // pg_dump + upload can take a while on large DBs
      },
    )
  : null;

// ========== Event Handlers ==========

if (backupWorker) {
  backupWorker.on("completed", (job, result) => {
    console.log(`✅ Database backup worker completed job ${job.id}:`, JSON.stringify(result));
  });
  backupWorker.on("failed", (job, err) => {
    console.error(`💥 Database backup worker failed job ${job?.id}:`, err.message);
    Sentry.captureException(err, {
      tags: { worker: "database-backup", jobId: job?.id },
    });
  });
} else {
  console.warn("⚠️ Database backup worker not available (Redis not connected)");
}

// ========== Register Repeatable Job ==========

export async function registerBackupJob() {
  if (!backupQueue) return;

  await backupQueue.add(
    "run-database-backup",
    {},
    {
      repeat: { pattern: process.env.BACKUP_SCHEDULE_CRON || "0 2 * * *" }, // daily at 2 AM by default
      removeOnComplete: 30,
      removeOnFail: 30,
    },
  );

  console.log("🗄️ Database backup job registered (daily at 2 AM)");
}
