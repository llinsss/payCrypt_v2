import redis from "../config/redis.js";
import logger from "../utils/logger.js";

class PerformanceService {
  constructor() {
    this.METRICS_KEY = "db_performance_metrics";
    this.SLOW_QUERIES_KEY = "slow_queries";
    this.MAX_SLOW_QUERIES = 100;
  }

  async trackQuery(duration, sql, isSlow = false) {
    try {
      if (!redis.isOpen) return;

      const pipeline = redis.multi();

      // Increment total queries
      pipeline.hIncrBy(this.METRICS_KEY, "total_queries", 1);
      
      // Update max duration
      // Note: Redis doesn't have a built-in HMAX, so we do it bit differently or just use another key
      // For simplicity, we can use a script or just update if higher
      
      // We'll use a simpler approach for now to avoid complexity in this step
      pipeline.hIncrBy(this.METRICS_KEY, "total_duration", Math.round(duration));

      if (isSlow) {
        pipeline.hIncrBy(this.METRICS_KEY, "slow_queries_count", 1);
        
        // Store the slow query details in a list
        const slowQueryInfo = JSON.stringify({
          sql,
          duration,
          timestamp: new Date().toISOString()
        });
        
        pipeline.lPush(this.SLOW_QUERIES_KEY, slowQueryInfo);
        pipeline.lTrim(this.SLOW_QUERIES_KEY, 0, this.MAX_SLOW_QUERIES - 1);
      }

      await pipeline.exec();
    } catch (error) {
      logger.error("Failed to track query metric", { error: error.message });
    }
  }

  async getMetrics() {
    try {
      if (!redis.isOpen) {
        return { error: "Redis not connected" };
      }

      const metrics = await redis.hGetAll(this.METRICS_KEY);
      const slowQueries = await redis.lRange(this.SLOW_QUERIES_KEY, 0, -1);

      const totalQueries = parseInt(metrics.total_queries || "0");
      const totalDuration = parseInt(metrics.total_duration || "0");
      const slowQueriesCount = parseInt(metrics.slow_queries_count || "0");

      return {
        totalQueries,
        totalDuration,
        averageDuration: totalQueries > 0 ? (totalDuration / totalQueries).toFixed(2) : 0,
        slowQueriesCount,
        slowQueries: slowQueries.map(q => JSON.parse(q)),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error("Failed to get performance metrics", { error: error.message });
      return { error: error.message };
    }
  }
  
  async resetMetrics() {
      try {
          await redis.del(this.METRICS_KEY);
          await redis.del(this.SLOW_QUERIES_KEY);
          return { success: true };
      } catch (error) {
          logger.error("Failed to reset metrics", { error: error.message });
          return { error: error.message };
      }
  }
}

export default new PerformanceService();
