import distributedLock from "../utils/distributedLock.js";
import AuditLog from "../models/AuditLog.js";
import ExportService from "./ExportService.js";

// Safety-net TTL for the lease: long enough to cover a slow cleanup run,
// short enough that a crashed replica doesn't wedge the lock until the next
// scheduled tick. The lease is released explicitly as soon as the job
// finishes, so this only matters if a process dies mid-run.
const DEFAULT_LOCK_TTL_MS = parseInt(process.env.HOUSEKEEPING_LOCK_TTL_MS, 10) || 10 * 60 * 1000;

const AUDIT_CLEANUP_JOB = "housekeeping:audit-log-cleanup";
const EXPORT_CLEANUP_JOB = "housekeeping:export-cleanup";

// In-memory last-run metrics, per job name. Each replica only records the
// outcome it actually observed (ran or skipped), but that's enough to answer
// "is this job still running somewhere" via GET /api/health.
const jobState = new Map();

function recordRun(name, patch) {
  jobState.set(name, { ...jobState.get(name), ...patch });
}

/**
 * Runs `task` only if this process wins the distributed lock for `name`.
 *
 * Every replica may call this on its own interval timer, but at most one of
 * them will hold the lock at a time, so only one actually executes `task`
 * per lease window — the others observe the lock held and skip without
 * touching the database or filesystem. This is a best-effort lease, not a
 * transactional guarantee, so `task` should be safe to run more than once
 * (both housekeeping jobs below already are: deleting rows/files older than
 * a cutoff is a no-op the second time it finds nothing new).
 */
async function runSingleton(name, task, { lockTtlMs = DEFAULT_LOCK_TTL_MS } = {}) {
  // Single, non-blocking acquisition attempt: if another replica already
  // holds the lease, skip this tick instead of queueing behind it.
  const identifier = await distributedLock.acquire(name, lockTtlMs, 1, 0);

  if (!identifier) {
    recordRun(name, { lastSkippedAt: new Date().toISOString() });
    return { ran: false };
  }

  const startedAt = Date.now();
  try {
    const result = await task();
    recordRun(name, {
      lastRunAt: new Date().toISOString(),
      lastDurationMs: Date.now() - startedAt,
      lastStatus: "success",
      lastResult: result,
      lastError: null,
    });
    return { ran: true, result };
  } catch (error) {
    recordRun(name, {
      lastRunAt: new Date().toISOString(),
      lastDurationMs: Date.now() - startedAt,
      lastStatus: "failed",
      lastError: error.message,
    });
    throw error;
  } finally {
    await distributedLock.release(name, identifier);
  }
}

/**
 * Deletes audit log entries older than `retentionDays`. Singleton across
 * replicas: only the instance holding the lease performs the delete.
 */
async function runAuditLogCleanup(retentionDays) {
  return runSingleton(AUDIT_CLEANUP_JOB, async () => {
    const deleted = await AuditLog.deleteOlderThan(retentionDays);
    if (deleted > 0) {
      console.log(`Audit log cleanup: deleted ${deleted} entries older than ${retentionDays} days`);
    }
    return { deleted };
  });
}

/**
 * Deletes expired export files/rows. Singleton across replicas: only the
 * instance holding the lease performs the cleanup.
 */
async function runExportCleanup() {
  return runSingleton(EXPORT_CLEANUP_JOB, async () => {
    const deleted = await ExportService.cleanupExpiredExports();
    if (deleted > 0) {
      console.log(`Export cleanup: deleted ${deleted} expired export files`);
    }
    return { deleted };
  });
}

/**
 * Snapshot of last-run metrics for housekeeping jobs on this replica,
 * exposed via GET /api/health for operational visibility. `lastRunAt` is
 * only set on a replica that actually held the lease and executed the job;
 * a replica that only ever skipped will show `lastSkippedAt` instead.
 */
function getHousekeepingStatus() {
  return {
    auditLogCleanup: jobState.get(AUDIT_CLEANUP_JOB) || null,
    exportCleanup: jobState.get(EXPORT_CLEANUP_JOB) || null,
  };
}

/**
 * Test-only hook: clears in-memory last-run metrics so tests don't leak
 * state between cases (mirrors ExportCleanupService.resetMetrics()).
 */
function resetHousekeepingStatus() {
  jobState.clear();
}

export default {
  runAuditLogCleanup,
  runExportCleanup,
  getHousekeepingStatus,
  resetHousekeepingStatus,
};
