'use strict';

require('dotenv').config();

const knex = require('knex');
const knexConfig = require('../knexfile');
const { getPoolMetrics } = require('../utils/dbPoolMonitor');

const CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY, 10) || 20;
const ITERATIONS = parseInt(process.env.LOAD_TEST_ITERATIONS, 10) || 100;

async function runQuery(db, id) {
  const start = Date.now();
  await db.raw('SELECT pg_sleep(0.05)'); // simulate 50 ms query
  return Date.now() - start;
}

async function main() {
  const db = knex(knexConfig[process.env.NODE_ENV || 'development']);
  console.log(`Load test: ${ITERATIONS} queries, concurrency ${CONCURRENCY}`);

  const durations = [];
  let completed = 0;

  while (completed < ITERATIONS) {
    const batch = Math.min(CONCURRENCY, ITERATIONS - completed);
    const results = await Promise.allSettled(
      Array.from({ length: batch }, (_, i) => runQuery(db, completed + i))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') durations.push(r.value);
      else console.error('Query failed:', r.reason.message);
    }

    completed += batch;
    console.log(`Progress: ${completed}/${ITERATIONS}`, getPoolMetrics(db));
  }

  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const max = Math.max(...durations);
  const min = Math.min(...durations);
  console.log(`\nResults — avg: ${avg}ms  min: ${min}ms  max: ${max}ms`);

  await db.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });
