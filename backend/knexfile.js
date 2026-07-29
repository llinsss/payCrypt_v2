import dotenv from "dotenv";
dotenv.config();

// Pool sizing: `min` keeps this many connections warm so requests don't pay
// connection-setup latency on every burst; `max` caps how many connections
// this process can hold open against Postgres's own max_connections limit
// (shared across all app instances + migrations/scripts). 10 is a
// conservative per-process ceiling — raise DB_POOL_MAX alongside Postgres's
// max_connections if running multiple instances or expecting higher
// concurrency. GET /api/health exposes live utilization so exhaustion shows
// up before it causes queuing/timeouts in production.
const poolMin = parseInt(process.env.DB_POOL_MIN, 10) || 2;
const poolMax = parseInt(process.env.DB_POOL_MAX, 10) || 10;
// How long a query will wait for a free connection before giving up.
const acquireTimeoutMs = parseInt(process.env.DB_ACQUIRE_TIMEOUT_MS, 10) || 30000;
// How long to wait for a new physical connection to Postgres to be established.
const createTimeoutMs = parseInt(process.env.DB_CREATE_TIMEOUT_MS, 10) || 10000;
// How long a connection can sit idle above `min` before being reaped.
const idleTimeoutMs = parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 60000;
const connectionTimeoutMs = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) || 10000;

const config = {
  development: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      connectionTimeoutMillis: connectionTimeoutMs,
    },
    migrations: {
      directory: "./migrations",
    },
    seeds: {
      directory: "./seeds",
    },
    pool: {
      min: poolMin,
      max: poolMax,
      acquireTimeoutMillis: acquireTimeoutMs,
      createTimeoutMillis: createTimeoutMs,
      idleTimeoutMillis: idleTimeoutMs,
      // How often the pool checks for idle connections to reap.
      reapIntervalMillis: 1000,
      // Delay between retries when a new connection fails to establish.
      createRetryIntervalMillis: 200,
    },
  },
  // Small, fixed pool: migration test runs are single-purpose and short-lived,
  // so they don't need production-sized headroom.
  test_migrations: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME_TEST_MIGRATIONS || "paycrypt_test_migrations",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      connectionTimeoutMillis: connectionTimeoutMs,
    },
    migrations: {
      directory: "./migrations",
    },
    seeds: {
      directory: "./seeds",
    },
    pool: {
      min: 1,
      max: 5,
    },
  },
};

export default config[process.env.NODE_ENV] || config.development;
