import knex from "knex";
import knexConfig from "../knexfile.js";
import logger from "../utils/logger.js";
import performanceService from "../services/PerformanceService.js";

const db = knex(knexConfig);

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


export default db;

