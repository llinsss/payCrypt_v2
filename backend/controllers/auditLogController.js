import AuditLog from "../models/AuditLog.js";

/**
 * Get paginated audit logs with filters
 * GET /api/audit-logs?action=CREATE&resource=api_keys&from=2026-01-01&to=2026-02-01&limit=20&offset=0
 */
export const getAuditLogs = async (req, res) => {
  try {
    const {
      action,
      resource,
      userId,
      from,
      to,
      limit = 20,
      offset = 0,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    const filters = {
      action,
      resource,
      userId,
      from,
      to,
      limit,
      offset,
      sortBy,
      sortOrder,
    };

    const [logs, total] = await Promise.all([
      AuditLog.query(filters),
      AuditLog.countByFilters(filters),
    ]);

    res.status(200).json({
      data: logs,
      pagination: {
        total,
        limit: Math.min(Math.max(parseInt(limit) || 20, 1), 100),
        offset: Math.max(parseInt(offset) || 0, 0),
        hasMore: parseInt(offset || 0) + logs.length < total,
      },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({ error: "Failed to retrieve audit logs" });
  }
};

/**
 * Get a single audit log entry by ID
 * GET /api/audit-logs/:id
 */
export const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await AuditLog.findById(id);

    if (!log) {
      return res.status(404).json({ error: "Audit log entry not found" });
    }

    res.status(200).json({ data: log });
  } catch (error) {
    console.error("Get audit log by ID error:", error);
    res.status(500).json({ error: "Failed to retrieve audit log entry" });
  }
};

/**
 * Get aggregate audit log statistics
 * GET /api/audit-logs/stats
 */
export const getAuditLogStats = async (req, res) => {
  try {
    const stats = await AuditLog.getStats();

    res.status(200).json({ data: stats });
  } catch (error) {
    console.error("Get audit log stats error:", error);
    res.status(500).json({ error: "Failed to retrieve audit log statistics" });
  }
};

/**
 * Manually trigger audit log cleanup (retention policy)
 * DELETE /api/audit-logs/cleanup
 */
export const cleanupAuditLogs = async (req, res) => {
  try {
    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 90;
    const deletedCount = await AuditLog.deleteOlderThan(retentionDays);

    res.status(200).json({
      message: "Audit log cleanup completed",
      deletedCount,
      retentionDays,
    });
  } catch (error) {
    console.error("Audit log cleanup error:", error);
    res.status(500).json({ error: "Failed to clean up audit logs" });
  }
};
