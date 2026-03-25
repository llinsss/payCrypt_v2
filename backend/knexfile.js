import dotenv from "dotenv";
dotenv.config();

const poolMin = parseInt(process.env.DB_POOL_MIN, 10) || 2;
const poolMax = parseInt(process.env.DB_POOL_MAX, 10) || 10;
const acquireTimeoutMs = parseInt(process.env.DB_ACQUIRE_TIMEOUT_MS, 10) || 30000;
const createTimeoutMs = parseInt(process.env.DB_CREATE_TIMEOUT_MS, 10) || 10000;
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
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
  },
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

export default config;
