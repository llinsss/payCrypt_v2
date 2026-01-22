import db from "../config/database.js";

/**
 * Database health check utilities
 */

export const checkDatabaseConnection = async () => {
  try {
    await db.raw("SELECT 1");
    return { healthy: true, message: "Database connection successful" };
  } catch (error) {
    console.error("Database connection failed:", error);
    return { healthy: false, message: error.message };
  }
};

export const getConnectionPoolStats = () => {
  const pool = db.client.pool;
  return {
    min: pool.min,
    max: pool.max,
    numUsed: pool.numUsed(),
    numFree: pool.numFree(),
    numPendingAcquires: pool.numPendingAcquires(),
    numPendingCreates: pool.numPendingCreates(),
  };
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
  gracefulShutdown,
};
