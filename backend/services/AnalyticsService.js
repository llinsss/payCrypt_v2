import db from "../config/database.js";
import redis from "../config/redis.js";
import logger from "../utils/logger.js";

const CACHE_TTL_SECONDS = 300; // 5 minutes

function parseDateRange({ from, to } = {}) {
  const toDate = to ? new Date(to) : new Date();
  // Default window: last 30 days
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  toDate.setHours(23, 59, 59, 999);
  fromDate.setHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

function getTruncFunction(period) {
  return { daily: "day", weekly: "week", monthly: "month" }[period] || "day";
}

function formatBucketDate(date, period) {
  const d = new Date(date);
  return period === "monthly" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
}

function buildCacheKey(endpoint, { period = "daily", from, to, userId } = {}) {
  return ["analytics", endpoint, period, from || "noFrom", to || "noTo", userId || "global"].join(":");
}

async function getFromCache(key) {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    logger.warn(`[AnalyticsService] Cache GET failed for ${key}`, { error: error.message });
    return null;
  }
}

async function setCache(key, value) {
  try {
    await redis.set(key, JSON.stringify(value), { EX: CACHE_TTL_SECONDS });
  } catch (error) {
    logger.warn(`[AnalyticsService] Cache SET failed for ${key}`, { error: error.message });
  }
}

const AnalyticsService = {
  // Add daily/weekly/monthly transaction volume
  async getTransactionVolume(period = 'daily') {
    if (period === 'all') {
      const result = await db("transactions")
        .sum("usd_value as total_volume")
        .where("deleted_at", null)
        .where("status", "completed")
        .first();
      return result || { total_volume: 0 };
    }

    let dateTrunc;
    switch (period) {
      case 'monthly':
        dateTrunc = 'month';
        break;
      case 'weekly':
        dateTrunc = 'week';
        break;
      case 'daily':
      default:
        dateTrunc = 'day';
        break;
    }

    const volume = await db("transactions")
      .select(db.raw("DATE_TRUNC(?, created_at) as date", [dateTrunc]))
      .sum("usd_value as total_volume")
      .where("deleted_at", null)
      .where("status", "completed")
      .groupByRaw("DATE_TRUNC(?, created_at)", [dateTrunc])
      .orderBy("date", "asc");

    return volume;
  },

  // Calculate average transaction size
  async getAverageTransactionSize(period = 'all') {
    let query = db("transactions")
      .avg("usd_value as average_size")
      .where("deleted_at", null)
      .where("status", "completed");

    if (period !== 'all') {
       let dateTrunc;
      switch (period) {
        case 'monthly': dateTrunc = 'month'; break;
        case 'weekly': dateTrunc = 'week'; break;
        case 'daily': dateTrunc = 'day'; break;
        default: dateTrunc = 'day';
      }
      query = db("transactions")
        .select(db.raw("DATE_TRUNC(?, created_at) as date", [dateTrunc]))
        .avg("usd_value as average_size")
        .where("deleted_at", null)
        .where("status", "completed")
        .groupByRaw("DATE_TRUNC(?, created_at)", [dateTrunc])
        .orderBy("date", "asc");
    } else {
        const result = await query.first();
        return result || { average_size: 0 };
    }
    
    return await query;
  },

  // Track transaction success rate
  async getTransactionSuccessRate() {
    const stats = await db("transactions")
      .select("status")
      .count("* as count")
      .where("deleted_at", null)
      .groupBy("status");

    let total = 0;
    let completed = 0;
    let failed = 0;

    stats.forEach(stat => {
      const count = parseInt(stat.count, 10);
      total += count;
      if (stat.status === 'completed') {
        completed += count;
      } else if (stat.status === 'failed' || stat.status === 'error') {
        failed += count;
      }
    });

    const successRate = total > 0 ? (completed / total) * 100 : 0;
    const failureRate = total > 0 ? (failed / total) * 100 : 0;

    return {
      total,
      completed,
      failed,
      successRate: parseFloat(successRate.toFixed(2)),
      failureRate: parseFloat(failureRate.toFixed(2))
    };
  },

  // Add user growth metrics
  async getUserGrowth(period = 'daily') {
    let dateTrunc;
    switch (period) {
      case 'monthly': dateTrunc = 'month'; break;
      case 'weekly': dateTrunc = 'week'; break;
      case 'daily':
      default: dateTrunc = 'day'; break;
    }

    const growth = await db("users")
      .select(db.raw("DATE_TRUNC(?, created_at) as date", [dateTrunc]))
      .count("* as new_users")
      .groupByRaw("DATE_TRUNC(?, created_at)", [dateTrunc])
      .orderBy("date", "asc");

    let cumulativeTotal = 0;
    const result = growth.map(g => {
      cumulativeTotal += parseInt(g.new_users, 10);
      return {
        date: g.date,
        new_users: parseInt(g.new_users, 10),
        total_users: cumulativeTotal
      };
    });

    return result;
  },

  // Implement time-series data aggregation
  async getTimeSeriesData(startDate, endDate, period = 'daily') {
    let dateTrunc;
    switch (period) {
      case 'monthly': dateTrunc = 'month'; break;
      case 'weekly': dateTrunc = 'week'; break;
      case 'daily':
      default: dateTrunc = 'day'; break;
    }

    let query = db("transactions")
      .select(
        db.raw("DATE_TRUNC(?, created_at) as date", [dateTrunc]),
        db.raw('COUNT(id) as transaction_count'),
        db.raw('SUM(usd_value) as volume')
      )
      .where("deleted_at", null)
      .where("status", "completed")
      .groupByRaw("DATE_TRUNC(?, created_at)", [dateTrunc])
      .orderBy("date", "asc");

    if (startDate) {
      query = query.where("created_at", ">=", startDate);
    }
    if (endDate) {
      query = query.where("created_at", "<=", endDate);
    }

    return await query;
  },

  async getDashboardSummary() {
      const volume = await this.getTransactionVolume('all');
      const successRate = await this.getTransactionSuccessRate();
      const avgSize = await this.getAverageTransactionSize('all');
      
      const totalUsers = await db("users").count("* as count").first();
      
      return {
          totalVolume: volume.total_volume || 0,
          successRate,
          averageSize: avgSize.average_size || 0,
          totalUsers: parseInt(totalUsers.count, 10) || 0
      };
  },

  // ---------------------------------------------------------------------
  // Overview / volume / tokens / chains — Redis-cached (5 min TTL)
  // ---------------------------------------------------------------------

  async computeVolumeByPeriod({ from, to, userId, period = "daily" } = {}) {
    const { fromDate, toDate } = parseDateRange({ from, to });
    const dateTrunc = getTruncFunction(period);

    let query = db("transactions")
      .select(db.raw("DATE_TRUNC(?, created_at) as date", [dateTrunc]))
      .sum("usd_value as volume")
      .count("id as count")
      .where("deleted_at", null)
      .where("status", "completed")
      .whereBetween("created_at", [fromDate, toDate])
      .groupByRaw("DATE_TRUNC(?, created_at)", [dateTrunc])
      .orderBy("date", "asc");

    if (userId) query = query.where("user_id", userId);

    const rows = await query;
    return rows.map((row) => ({
      date: formatBucketDate(row.date, period),
      volume: parseFloat(Number(row.volume).toFixed(2)),
      count: parseInt(row.count, 10),
    }));
  },

  async computeTopTokens({ from, to, userId } = {}, limit = 10) {
    const { fromDate, toDate } = parseDateRange({ from, to });

    let query = db({ t: "transactions" })
      .join({ tok: "tokens" }, "t.token_id", "tok.id")
      .select("tok.symbol as symbol")
      .sum("t.usd_value as volume")
      .count("t.id as count")
      .where("t.deleted_at", null)
      .where("t.status", "completed")
      .whereBetween("t.created_at", [fromDate, toDate])
      .groupBy("tok.symbol")
      .orderBy("volume", "desc")
      .limit(limit);

    if (userId) query = query.where("t.user_id", userId);

    const rows = await query;
    return rows.map((row) => ({
      symbol: row.symbol,
      volume: parseFloat(Number(row.volume).toFixed(2)),
      count: parseInt(row.count, 10),
    }));
  },

  async computeTopChains({ from, to, userId } = {}, limit = 10) {
    const { fromDate, toDate } = parseDateRange({ from, to });

    let query = db({ t: "transactions" })
      .join({ c: "chains" }, "t.chain_id", "c.id")
      .select("c.id as chainId", "c.name as chainName")
      .count("t.id as count")
      .sum("t.usd_value as volume")
      .where("t.deleted_at", null)
      .where("t.status", "completed")
      .whereBetween("t.created_at", [fromDate, toDate])
      .groupBy("c.id", "c.name")
      .orderBy("count", "desc")
      .limit(limit);

    if (userId) query = query.where("t.user_id", userId);

    const rows = await query;
    return rows.map((row) => ({
      chainId: String(row.chainId),
      chainName: row.chainName,
      count: parseInt(row.count, 10),
      volume: parseFloat(Number(row.volume).toFixed(2)),
    }));
  },

  async computeOverviewStats({ from, to, userId } = {}) {
    const { fromDate, toDate } = parseDateRange({ from, to });

    let query = db("transactions")
      .select(
        db.raw("COALESCE(SUM(usd_value), 0) as total_volume"),
        db.raw("COUNT(id) as total_transactions"),
        db.raw("COALESCE(AVG(usd_value), 0) as average_value"),
        db.raw("COUNT(id) FILTER (WHERE status = 'completed') as completed_count"),
        db.raw("COUNT(id) FILTER (WHERE status = 'pending') as pending_count"),
        db.raw("COUNT(id) FILTER (WHERE status = 'failed') as failed_count")
      )
      .where("deleted_at", null)
      .whereBetween("created_at", [fromDate, toDate]);

    if (userId) query = query.where("user_id", userId);

    const row = await query.first();
    const totalTransactions = parseInt(row.total_transactions, 10) || 0;
    const completedCount = parseInt(row.completed_count, 10) || 0;
    const successRate = totalTransactions > 0
      ? parseFloat(((completedCount / totalTransactions) * 100).toFixed(2))
      : 0;

    return {
      totalVolume: parseFloat(Number(row.total_volume).toFixed(2)),
      totalTransactions,
      averageValue: parseFloat(Number(row.average_value).toFixed(2)),
      successRate,
      completedCount,
      pendingCount: parseInt(row.pending_count, 10) || 0,
      failedCount: parseInt(row.failed_count, 10) || 0,
    };
  },

  // GET /api/analytics/overview — summary + volume trend + top tokens/chains
  async getOverview(params = {}) {
    const cacheKey = buildCacheKey("overview", params);
    const cached = await getFromCache(cacheKey);
    if (cached) return cached;

    const [overview, volumeByPeriod, topTokens, topChains] = await Promise.all([
      this.computeOverviewStats(params),
      this.computeVolumeByPeriod({ ...params, period: "daily" }),
      this.computeTopTokens(params),
      this.computeTopChains(params),
    ]);

    const result = { overview, volumeByPeriod, topTokens, topChains };
    await setCache(cacheKey, result);
    return result;
  },

  // GET /api/analytics/volume?period=daily&from=&to=&userId=
  async getVolume(params = {}) {
    const cacheKey = buildCacheKey("volume", params);
    const cached = await getFromCache(cacheKey);
    if (cached) return cached;

    const result = await this.computeVolumeByPeriod(params);
    await setCache(cacheKey, result);
    return result;
  },

  // GET /api/analytics/tokens — top tokens by volume/count
  async getTokens(params = {}) {
    const cacheKey = buildCacheKey("tokens", params);
    const cached = await getFromCache(cacheKey);
    if (cached) return cached;

    const result = await this.computeTopTokens(params);
    await setCache(cacheKey, result);
    return result;
  },

  // GET /api/analytics/chains — top chains by count/volume
  async getChains(params = {}) {
    const cacheKey = buildCacheKey("chains", params);
    const cached = await getFromCache(cacheKey);
    if (cached) return cached;

    const result = await this.computeTopChains(params);
    await setCache(cacheKey, result);
    return result;
  },
};

export default AnalyticsService;
