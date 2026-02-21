import { Worker, Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import ReconciliationService from "../services/ReconciliationService.js";

// ========== Queue ==========

export const reconciliationQueue = redisConnection
  ? new Queue("balance-reconciliation", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    })
  : null;

// ========== Worker ==========

export const reconciliationWorker = redisConnection
  ? new Worker(
      "balance-reconciliation",
      async (job) => {
        console.log(`🔍 Reconciliation worker: starting job ${job.id}...`);

        const report = await ReconciliationService.runFullReconciliation();

        // Fail the job loudly if there were errors so it's visible in Bull Board
        if (report.errors > 0) {
          console.warn(
            `⚠️ Reconciliation finished with ${report.errors} error(s). See report for details.`,
          );
        }

        return {
          total: report.total,
          ok: report.ok,
          corrected: report.corrected + report.corrected_flagged,
          major_discrepancies: report.major_discrepancies,
          app_balance_corrections: report.app_balance_corrections,
          errors: report.errors,
          duration_ms: report.duration_ms,
        };
      },
      {
        connection: redisConnection,
        concurrency: 1, // only one reconciliation run at a time
        lockDuration: 5 * 60 * 1000, // 5 min lock — gives time for large account sets
      },
    )
  : null;

// ========== Event Handlers ==========

if (reconciliationWorker) {
  reconciliationWorker.on("completed", (job, result) => {
    console.log(
      `✅ Reconciliation worker completed job ${job.id}:`,
      JSON.stringify(result),
    );
  });
  reconciliationWorker.on("failed", (job, err) => {
    console.error(`💥 Reconciliation worker failed job ${job?.id}:`, err.message);
  });
} else {
  console.warn("⚠️ Reconciliation worker not available (Redis not connected)");
}

// ========== Register Repeatable Job ==========

export async function registerReconciliationJob() {
  if (!reconciliationQueue) return;

  await reconciliationQueue.add(
    "reconcile-balances",
    {},
    {
      repeat: {
        // Run every 6 hours; adjust via env for tighter schedules
        every: parseInt(process.env.RECONCILE_INTERVAL_MS ?? String(6 * 60 * 60 * 1000)),
      },
      removeOnComplete: 20,
      removeOnFail: false,
    },
  );

  console.log("🔍 Balance reconciliation job registered (every 6h)");
}
