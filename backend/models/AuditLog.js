import db from "../config/database.js";

const AuditLog = {
  /**
   * Create a new audit log entry
   */
  async create(logData) {
    const [id] = await db("audit_logs").insert({
      user_id: logData.userId || null,
      action: logData.action,
      resource: logData.resource,
      resource_id: logData.resourceId || null,
      details: logData.details ? JSON.stringify(logData.details) : null,
      ip_address: logData.ipAddress || null,
      user_agent: logData.userAgent || null,
      method: logData.method,
      endpoint: logData.endpoint,
      status_code: logData.statusCode || null,
    });

    return this.findById(id);
  },

  /**
   * Find audit log by ID
   */
  async findById(id) {
    return await db("audit_logs").where({ id }).first();
  },

  /**
   * Query audit logs with filters and pagination
   */
  async query(filters = {}) {
    const {
      userId,
      action,
      resource,
      from,
      to,
      limit = 20,
      offset = 0,
      sortBy = "created_at",
      sortOrder = "desc",
    } = filters;

    let query = db("audit_logs")
      .select("audit_logs.*", "users.email as user_email", "users.tag as user_tag")
      .leftJoin("users", "audit_logs.user_id", "users.id");

    if (userId) {
      query = query.where("audit_logs.user_id", userId);
    }

    if (action) {
      query = query.where("audit_logs.action", action);
    }

    if (resource) {
      query = query.where("audit_logs.resource", resource);
    }

    if (from) {
      query = query.where("audit_logs.created_at", ">=", from);
    }

    if (to) {
      query = query.where("audit_logs.created_at", "<=", to);
    }

    const allowedSortFields = ["created_at", "action", "resource", "status_code"];
    const sanitizedSortBy = allowedSortFields.includes(sortBy) ? sortBy : "created_at";
    const sanitizedSortOrder = sortOrder === "asc" ? "asc" : "desc";

    return await query
      .orderBy(`audit_logs.${sanitizedSortBy}`, sanitizedSortOrder)
      .limit(Math.min(Math.max(parseInt(limit) || 20, 1), 100))
      .offset(Math.max(parseInt(offset) || 0, 0));
  },

  /**
   * Count audit logs matching filters (for pagination)
   */
  async countByFilters(filters = {}) {
    const { userId, action, resource, from, to } = filters;

    let query = db("audit_logs").count("* as total");

    if (userId) {
      query = query.where("user_id", userId);
    }

    if (action) {
      query = query.where("action", action);
    }

    if (resource) {
      query = query.where("resource", resource);
    }

    if (from) {
      query = query.where("created_at", ">=", from);
    }

    if (to) {
      query = query.where("created_at", "<=", to);
    }

    const result = await query.first();
    return result ? parseInt(result.total) : 0;
  },

  /**
   * Get audit logs for a specific user
   */
  async getByUserId(userId, limit = 20, offset = 0) {
    return await db("audit_logs")
      .where({ user_id: userId })
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);
  },

  /**
   * Delete audit logs older than specified days (retention policy)
   */
  async deleteOlderThan(days = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await db("audit_logs")
      .where("created_at", "<", cutoffDate)
      .del();
  },

  /**
   * Create audit log for failed payment/transaction
   * Used when Stellar transaction fails or DB commit fails after Stellar success
   */
  async createFailedTransactionAudit(logData) {
    const [id] = await db("audit_logs").insert({
      user_id: logData.userId || null,
      action: "payment_failed",
      resource: "transaction",
      resource_id: logData.resourceId ? String(logData.resourceId) : null,
      details: logData.details ? (typeof logData.details === "string" ? logData.details : JSON.stringify(logData.details)) : null,
      ip_address: null,
      user_agent: null,
      method: "PAYMENT",
      endpoint: "/internal/failed-transaction",
      status_code: null,
    });

    return this.findById(id);
  },

  /**
   * Get aggregate statistics for audit logs
   */
  async getStats() {
    const [actionStats, resourceStats, totalCount] = await Promise.all([
      db("audit_logs")
        .select("action")
        .count("* as count")
        .groupBy("action")
        .orderBy("count", "desc"),
      db("audit_logs")
        .select("resource")
        .count("* as count")
        .groupBy("resource")
        .orderBy("count", "desc"),
      db("audit_logs").count("* as total").first(),
    ]);

    return {
      total: totalCount ? parseInt(totalCount.total) : 0,
      byAction: actionStats.map((row) => ({
        action: row.action,
        count: parseInt(row.count),
      })),
      byResource: resourceStats.map((row) => ({
        resource: row.resource,
        count: parseInt(row.count),
      })),
    };
  },
};

export default AuditLog;
