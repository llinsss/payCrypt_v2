'use strict';

/**
 * Returns current pool metrics from a Knex instance.
 * Works with knex-tarn (the default pool library for knex >= 0.95).
 */
function getPoolMetrics(knex) {
  const pool = knex.client.pool;
  return {
    total: pool.numUsed() + pool.numFree() + pool.numPendingCreates(),
    used: pool.numUsed(),
    free: pool.numFree(),
    pendingAcquires: pool.numPendingAcquires(),
    pendingCreates: pool.numPendingCreates(),
    min: pool.min,
    max: pool.max,
  };
}

/**
 * Verifies the pool can acquire a connection and run a trivial query.
 * Resolves with { healthy: true } or { healthy: false, error: string }.
 */
async function checkPoolHealth(knex) {
  try {
    await knex.raw('SELECT 1');
    return { healthy: true, metrics: getPoolMetrics(knex) };
  } catch (err) {
    return { healthy: false, error: err.message, metrics: getPoolMetrics(knex) };
  }
}

/**
 * Starts periodic pool metric logging.
 * @param {object} knex  - Knex instance
 * @param {number} intervalMs - How often to log (default 60 s)
 * @returns {NodeJS.Timeout} timer handle (call clearInterval to stop)
 */
function startPoolMonitoring(knex, intervalMs = 60000) {
  return setInterval(() => {
    const metrics = getPoolMetrics(knex);
    const utilizationPct = Math.round((metrics.used / metrics.max) * 100);
    console.log('[pool-monitor]', { ...metrics, utilizationPct: `${utilizationPct}%` });

    if (utilizationPct >= 80) {
      console.warn('[pool-monitor] WARNING: pool utilization >= 80%');
    }
  }, intervalMs);
}

module.exports = { getPoolMetrics, checkPoolHealth, startPoolMonitoring };
