import AuditLog from "../models/AuditLog.js";

/**
 * Fields to strip from audit log details to prevent sensitive data leaks
 */
const SENSITIVE_FIELDS = [
  "password",
  "secret",
  "senderSecret",
  "additionalSecrets",
  "token",
  "key",
  "authorization",
];

/**
 * Map HTTP methods to audit actions
 */
const METHOD_ACTION_MAP = {
  GET: "READ",
  POST: "CREATE",
  PUT: "UPDATE",
  PATCH: "UPDATE",
  DELETE: "DELETE",
};

/**
 * Sanitize request body by removing sensitive fields
 */
function sanitizeBody(body) {
  if (!body || typeof body !== "object") return null;

  const sanitized = { ...body };
  for (const field of SENSITIVE_FIELDS) {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  }
  return sanitized;
}

/**
 * Extract resource ID from request params
 */
function extractResourceId(params) {
  if (!params) return null;
  return params.id || params.keyId || params.tag || null;
}

/**
 * Audit log middleware factory
 *
 * @param {string} resource - Name of the resource being accessed (e.g. "users", "transactions")
 * @returns {Function} Express middleware
 *
 * Usage: router.post("/", auditLog("api_keys"), createApiKey);
 */
export const auditLog = (resource) => {
  return (req, res, next) => {
    const originalEnd = res.end;
    const startTime = Date.now();

    res.end = function (...args) {
      res.end = originalEnd;
      res.end(...args);

      const statusCode = res.statusCode;
      if (statusCode >= 500) return;

      const action = METHOD_ACTION_MAP[req.method] || req.method;

      // Build audit log entry (fire-and-forget, never blocks the response)
      const logData = {
        userId: req.user?.id || null,
        action,
        resource,
        resourceId: extractResourceId(req.params),
        details: sanitizeBody(req.body),
        ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"] || null,
        method: req.method,
        endpoint: req.originalUrl,
        statusCode,
      };

      AuditLog.create(logData).catch((err) => {
        console.error("Audit log write failed:", err.message);
      });
    };

    next();
  };
};
