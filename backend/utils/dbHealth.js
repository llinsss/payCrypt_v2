import db from "../config/database.js";
import redis from "../config/redis.js";
import { checkStellarHealth } from "../services/stellarMonitor.js";

/**
 * Database health check utilities
 */

export const checkDatabaseConnection = async () => {
  const start = Date.now();
  try {
    await db.raw("SELECT 1");
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      message: "Database connection successful",
    };
  } catch (error) {
    console.error("Database connection failed:", error);
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      message: error.message,
    };
  }
};

export const getConnectionPoolStats = () => {
  try {
    const pool = db.client.pool;
    return {
      min: pool.min,
      max: pool.max,
      numUsed: pool.numUsed(),
      numFree: pool.numFree(),
      numPendingAcquires: pool.numPendingAcquires(),
      numPendingCreates: pool.numPendingCreates(),
    };
  } catch (error) {
    console.error("Failed to get connection pool stats:", error);
    return { error: error.message };
  }
};

export const checkMigrationStatus = async () => {
  try {
    const [currentBatch] = await db.migrate.currentVersion();
    const migrations = await db.migrate.list();

    return {
      currentVersion: currentBatch,
      pending: migrations[1],
      completed: migrations[0],
    };
  } catch (error) {
    console.error("Failed to check migration status:", error);
    return { error: error.message };
  }
};

export const testDatabasePerformance = async () => {
  const start = Date.now();

  try {
    // Test simple query
    await db.raw("SELECT 1");
    const simpleQueryTime = Date.now() - start;

    // Test table query
    const tableStart = Date.now();
    await db("users").count("* as count").first();
    const tableQueryTime = Date.now() - tableStart;

    return {
      healthy: true,
      simpleQueryMs: simpleQueryTime,
      tableQueryMs: tableQueryTime,
      totalMs: Date.now() - start,
    };
  } catch (error) {
    console.error("Database performance test failed:", error);
    return {
      healthy: false,
      error: error.message,
    };
  }
};

/**
 * Redis health check
 * Handles the fallback stub mode where redis is replaced with no-op functions
 */
export const checkRedisConnection = async () => {
  const start = Date.now();
  try {
    if (typeof redis.ping !== "function") {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: "Redis is in fallback mode (not connected)",
      };
    }

    await redis.ping();
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      message: "Redis connection successful",
    };
  } catch (error) {
    console.error("Redis connection failed:", error);
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      message: error.message,
    };
  }
};

/**
 * Stellar (external API) health check
 * Wraps the existing stellarMonitor service and normalizes the response
 */
export const checkStellarConnection = async () => {
  const start = Date.now();
  try {
    const result = await checkStellarHealth();
    return {
      healthy: result.status === "up",
      latencyMs: parseFloat(result.latency) || Date.now() - start,
      details: result.details || null,
      message:
        result.status === "up"
          ? "Stellar Horizon API is reachable"
          : result.error || "Stellar Horizon API is unreachable",
    };
  } catch (error) {
    console.error("Stellar connection check failed:", error);
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      message: error.message,
    };
  }
};

/**
 * Run all dependency health checks in parallel
 * Uses Promise.allSettled so one failure doesn't prevent other checks
 */
export const checkAllDependencies = async () => {
  const [dbResult, redisResult, stellarResult] = await Promise.allSettled([
    checkDatabaseConnection(),
    checkRedisConnection(),
    checkStellarConnection(),
  ]);

  const database =
    dbResult.status === "fulfilled"
      ? dbResult.value
      : { healthy: false, message: dbResult.reason?.message };

  const redisCheck =
    redisResult.status === "fulfilled"
      ? redisResult.value
      : { healthy: false, message: redisResult.reason?.message };

  const stellar =
    stellarResult.status === "fulfilled"
      ? stellarResult.value
      : { healthy: false, message: stellarResult.reason?.message };

  const allHealthy = database.healthy && redisCheck.healthy && stellar.healthy;

  return {
    healthy: allHealthy,
    database,
    redis: redisCheck,
    stellar,
  };
};

export const gracefulShutdown = async () => {
  try {
    await db.destroy();
    console.log("Database connection pool closed");
  } catch (error) {
    console.error("Error closing database connection:", error);
    throw error;
  }
};

export default {
  checkDatabaseConnection,
  getConnectionPoolStats,
  checkMigrationStatus,
  testDatabasePerformance,
  checkRedisConnection,
  checkStellarConnection,
  checkAllDependencies,
  gracefulShutdown,
};
