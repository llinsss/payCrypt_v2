/**
 * Fires N concurrent queries at the live Knex pool and reports whether any
 * request errored or timed out waiting for a connection, plus pool
 * utilization before/after. Used to validate DB_POOL_MAX/DB_POOL_MIN sizing
 * (see knexfile.js) under load.
 *
 * Usage: node scripts/load-test-pool.js [concurrency]
 * Requires a reachable database (see backend/.env).
 */
import db, { getPoolMetrics } from "../config/database.js";

const CONCURRENCY = parseInt(process.argv[2], 10) || 100;

const runOne = async (id) => {
  const start = Date.now();
  try {
    await db.raw("SELECT pg_sleep(0.05)"); // simulate a small amount of query work
    return { id, ok: true, durationMs: Date.now() - start };
  } catch (error) {
    return { id, ok: false, durationMs: Date.now() - start, error: error.message };
  }
};

const main = async () => {
  console.log(`Pool config before load: ${JSON.stringify(getPoolMetrics())}`);
  console.log(`Firing ${CONCURRENCY} concurrent requests...`);

  const start = Date.now();
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => runOne(i))
  );
  const totalMs = Date.now() - start;

  const failures = results.filter((r) => !r.ok);
  const durations = results.map((r) => r.durationMs);
  const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxMs = Math.max(...durations);

  console.log(`Pool metrics after load: ${JSON.stringify(getPoolMetrics())}`);
  console.log(`Completed ${results.length} requests in ${totalMs}ms`);
  console.log(`  avg: ${avgMs.toFixed(1)}ms  max: ${maxMs.toFixed(1)}ms  failures: ${failures.length}`);

  if (failures.length > 0) {
    console.error("FAILED requests:", failures.slice(0, 5));
    process.exitCode = 1;
  } else {
    console.log(`PASS: pool handled ${CONCURRENCY} concurrent requests without exhaustion.`);
  }

  await db.destroy();
};

main().catch((error) => {
  console.error("Load test crashed:", error);
  process.exitCode = 1;
});
