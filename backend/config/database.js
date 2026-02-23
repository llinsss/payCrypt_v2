import knex from "knex";
import knexConfig from "../knexfile.js";
import logger from "../utils/logger.js";
import performanceService from "../services/PerformanceService.js";

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

const SLOW_QUERY_THRESHOLD = process.env.SLOW_QUERY_THRESHOLD || 200; // ms
const ALERT_QUERY_THRESHOLD = process.env.ALERT_QUERY_THRESHOLD || 1000; // ms

db.on("query", (query) => {
  query.__startTime = Date.now();
});

db.on("query-response", (response, obj, builder) => {
  if (obj.__startTime) {
    const duration = Date.now() - obj.__startTime;
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

export { getPoolMetrics, checkConnectionHealth, ensureConnectionWithRetry };
export default db;

