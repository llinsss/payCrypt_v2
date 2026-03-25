import db from "../config/database.js";

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
      .select(db.raw(`DATE_TRUNC('${dateTrunc}', created_at) as date`))
      .sum("usd_value as total_volume")
      .where("deleted_at", null)
      .where("status", "completed")
      .groupByRaw(`DATE_TRUNC('${dateTrunc}', created_at)`)
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
        .select(db.raw(`DATE_TRUNC('${dateTrunc}', created_at) as date`))
        .avg("usd_value as average_size")
        .where("deleted_at", null)
        .where("status", "completed")
        .groupByRaw(`DATE_TRUNC('${dateTrunc}', created_at)`)
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
      .select(db.raw(`DATE_TRUNC('${dateTrunc}', created_at) as date`))
      .count("* as new_users")
      .groupByRaw(`DATE_TRUNC('${dateTrunc}', created_at)`)
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
        db.raw(`DATE_TRUNC('${dateTrunc}', created_at) as date`),
        db.raw('COUNT(id) as transaction_count'),
        db.raw('SUM(usd_value) as volume')
      )
      .where("deleted_at", null)
      .where("status", "completed")
      .groupByRaw(`DATE_TRUNC('${dateTrunc}', created_at)`)
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
  }
};

export default AnalyticsService;
