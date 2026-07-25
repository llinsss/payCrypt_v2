import knex from "knex";
import * as Sentry from "@sentry/node";
import knexConfig from "../knexfile.js";
import logger from "../utils/logger.js";
import performanceService from "../services/PerformanceService.js";
import * as Sentry from "@sentry/node";

const CONNECTION_ACQUIRE_TIMEOUT_MS =
  Number(process.env.DB_ACQUIRE_TIMEOUT_MS) || 30000;

const DB_RETRY_MAX_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.DB_RETRY_MAX_ATTEMPTS, 10) || 5
);
const DB_RETRY_INITIAL_DELAY_MS = Math.max(
  100,
  parseInt(process.env.DB_RETRY_INITIAL_DELAY_MS, 10) || 1000
);
const DB_RETRY_BACKOFF_MULTIPLIER = Math.max(
  1,
  parseFloat(process.env.DB_RETRY_BACKOFF_MULTIPLIER) || 2
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const db = knex(knexConfig);

function getPool() {
  try {
    return db.client?.pool ?? null;
  } catch {
    return null;
  }
}

function getPoolMetrics() {
  const pool = getPool();
  if (!pool || typeof pool.numUsed !== "function") return null;
  try {
    const used = pool.numUsed();
    const free = pool.numFree();
    const pendingAcquires = pool.numPendingAcquires?.() ?? 0;
    const pendingCreates = pool.numPendingCreates?.() ?? 0;
    const max = knexConfig.pool?.max ?? 10;
    const total = used + free;
    const utilizationPercent = max > 0 ? Math.round((used / max) * 100) : 0;
    return {
      used,
      free,
      total,
      max,
      pendingAcquires,
      pendingCreates,
      utilizationPercent,
    };
  } catch (err) {
    logger.warn("Failed to read pool metrics", { error: err?.message });
    return null;
  }
}

db.on("pool-error", (err) => {
  logger.error("Database pool error", {
    error: err.message,
    type: "database_pool",
  });
});

db.on("pool-acquire-request-timeout", () => {
  logger.warn("Database connection acquire timeout", {
    timeoutMs: CONNECTION_ACQUIRE_TIMEOUT_MS,
    type: "database_pool",
  });
});

// ===== Periodic pool monitoring =====
// Reactive listeners above only fire on hard failures (errors, acquire
// timeouts). This proactively polls pool utilization so we get a warning
// before requests actually start queuing or timing out.
const POOL_MONITOR_INTERVAL_MS =
  Number(process.env.DB_POOL_MONITOR_INTERVAL_MS) || 30000;
const POOL_UTILIZATION_CRITICAL_THRESHOLD =
  Number(process.env.DB_POOL_CRITICAL_THRESHOLD_PERCENT) || 80;
// Don't spam Sentry every interval while the pool stays hot.
const CRITICAL_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
let lastCriticalAlertAt = 0;

function monitorPoolHealth() {
  const metrics = getPoolMetrics();
  if (!metrics) return;

  if (metrics.pendingAcquires > 0) {
    logger.warn("Database pool has requests waiting for a connection", {
      ...metrics,
      type: "database_pool",
    });
  }

  if (metrics.utilizationPercent >= POOL_UTILIZATION_CRITICAL_THRESHOLD) {
    logger.error("Database pool utilization critical", {
      ...metrics,
      type: "database_pool",
      alert: true,
    });

    const now = Date.now();
    if (now - lastCriticalAlertAt > CRITICAL_ALERT_COOLDOWN_MS) {
      lastCriticalAlertAt = now;
      Sentry.captureMessage("Database connection pool utilization critical", {
        level: "error",
        tags: { type: "database_pool" },
        extra: metrics,
      });
    }
  }
}

const poolMonitorHandle = setInterval(monitorPoolHealth, POOL_MONITOR_INTERVAL_MS);
poolMonitorHandle.unref?.();

const SLOW_QUERY_THRESHOLD = process.env.SLOW_QUERY_THRESHOLD || 200; // ms
const ALERT_QUERY_THRESHOLD = process.env.ALERT_QUERY_THRESHOLD || 1000; // ms

db.on("query", (query) => {
  query.__startTime = Date.now();
  query.__sentrySpan = Sentry.startInactiveSpan({
    name: query.sql || "database query",
    op: "db.query",
    attributes: { "db.system": "postgresql", "db.operation": query.method || "query" },
  });
});

db.on("query-response", (response, obj, builder) => {
  if (obj.__startTime) {
    const duration = Date.now() - obj.__startTime;
    obj.__sentrySpan?.setAttribute("db.duration_ms", duration);
    obj.__sentrySpan?.end();
    const sql = obj.sql;
    const isSlow = duration >= SLOW_QUERY_THRESHOLD;

    if (duration >= ALERT_QUERY_THRESHOLD) {
      logger.error(`🚨 CRITICAL Slow Database Query (${duration}ms): ${sql}`, {
        duration,
        sql,
        type: 'database_performance',
        alert: true
      });
    } else if (isSlow) {
      logger.warn(`Slow Database Query (${duration}ms): ${sql}`, {
        duration,
        sql,
        type: 'database_performance',
        slow: true
      });
    } else if (process.env.DEBUG_QUERIES === 'true') {
      logger.debug(`Database Query (${duration}ms): ${sql}`, {
        duration,
        sql,
        type: 'database_performance',
        slow: false
      });
    }

    // Track metrics for dashboard
    performanceService.trackQuery(duration, sql, isSlow).catch(err => {
        logger.error("Error tracking query performance", { error: err.message });
    });
  }
});

db.on("query-error", (error, obj) => {
  if (obj.__startTime) {
    const duration = Date.now() - obj.__startTime;
    obj.__sentrySpan?.setAttribute("db.duration_ms", duration);
    obj.__sentrySpan?.setStatus({ code: 2 });
    obj.__sentrySpan?.end();
    logger.error(`Database Query Error (${duration}ms): ${obj.sql}`, {
      error: error.message,
      duration,
      sql: obj.sql,
      type: 'database_performance'
    });
    
    // Track error as a slow query or just log it
    performanceService.trackQuery(duration, obj.sql, true).catch(err => {
        logger.error("Error tracking query error performance", { error: err.message });
    });
  }
});

async function checkConnectionHealth() {
  const start = Date.now();
  try {
    await db.raw("SELECT 1");
    const latencyMs = Date.now() - start;
    const poolMetrics = getPoolMetrics();
    return {
      healthy: true,
      latencyMs,
      pool: poolMetrics,
    };
  } catch (err) {
    logger.error("Connection health check failed", {
      error: err?.message,
      type: "database_health",
    });
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err?.message,
      pool: getPoolMetrics(),
    };
  }
}

/**
 * Verify database connection with exponential backoff retry.
 * @param {Object} [options]
 * @param {number} [options.maxAttempts] - Max retry attempts (default from env or 5)
 * @param {number} [options.initialDelayMs] - Initial delay before first retry (ms)
 * @param {number} [options.backoffMultiplier] - Multiplier for delay after each failure
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function ensureConnectionWithRetry(options = {}) {
  const maxAttempts = options.maxAttempts ?? DB_RETRY_MAX_ATTEMPTS;
  let delayMs = options.initialDelayMs ?? DB_RETRY_INITIAL_DELAY_MS;
  const backoffMultiplier = options.backoffMultiplier ?? DB_RETRY_BACKOFF_MULTIPLIER;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.raw("SELECT 1");
      if (attempt > 1) {
        logger.info("Database connection established after retry", {
          attempt,
          type: "database_retry",
        });
      }
      return { ok: true };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        logger.warn("Database connection failed, retrying", {
          attempt,
          maxAttempts,
          nextRetryInMs: delayMs,
          error: err?.message,
          type: "database_retry",
        });
        await sleep(delayMs);
        delayMs = Math.round(delayMs * backoffMultiplier);
      } else {
        logger.error("Database connection failed after max retries", {
          attempt,
          maxAttempts,
          error: err?.message,
          type: "database_retry",
        });
      }
    }
  }

  return {
    ok: false,
    error: lastError?.message ?? "Connection failed",
  };
}

function stopPoolMonitoring() {
  clearInterval(poolMonitorHandle);
}

export {
  getPoolMetrics,
  checkConnectionHealth,
  ensureConnectionWithRetry,
  stopPoolMonitoring,
};
export default db;
