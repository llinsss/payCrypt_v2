import { createRequestLogger } from "../utils/logger.js";
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from "./correlationId.js";

// Fields that must never appear in logs
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "x-auth-token",
  "set-cookie",
  "proxy-authorization",
]);

const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "password_hash",
  "passwordHash",
  "confirmPassword",
  "secret",
  "privateKey",
  "private_key",
  "secretKey",
  "secret_key",
  "senderSecret",
  "additionalSecrets",
  "additionalSigningKeys",
  "token",
  "accessToken",
  "refreshToken",
  "cvv",
  "cardNumber",
  "card_number",
  "ssn",
  "pin",
]);

// Request body size limit for logging (bytes). Bodies larger than this are
// replaced with a placeholder so we don't flood the log store.
const MAX_BODY_LOG_SIZE = parseInt(
  process.env.LOG_MAX_BODY_BYTES ?? "2048",
  10,
);

/**
 * Scrub sensitive headers from a headers object.
 * Returns a new object — never mutates the original.
 */
function sanitizeHeaders(headers = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? "[REDACTED]"
      : value;
  }
  return sanitized;
}

/**
 * Recursively redact sensitive keys from a plain object.
 * Returns a new object — never mutates the original.
 */
function sanitizeBody(obj, depth = 0) {
  if (
    depth > 5 ||
    obj === null ||
    typeof obj !== "object" ||
    Array.isArray(obj)
  ) {
    return obj;
  }

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_BODY_KEYS.has(key)) {
      out[key] = "[REDACTED]";
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = sanitizeBody(value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Determine whether the request body should be logged.
 * Returns the sanitized body, a size-exceeded placeholder, or undefined.
 */
function resolveBodyForLog(req) {
  if (!req.body || Object.keys(req.body).length === 0) return undefined;

  const raw = JSON.stringify(req.body);
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_LOG_SIZE) {
    return `[BODY_TOO_LARGE: ${Buffer.byteLength(raw, "utf8")} bytes]`;
  }

  return sanitizeBody(req.body);
}

/**
 * Structured request/response logger middleware.
 *
 * Logs two entries per request:
 *   1. REQUEST  — logged when the request arrives (before processing)
 *   2. RESPONSE — logged when the response finishes (after processing)
 *
 * Both entries share the same correlationId and requestId so they can be
 * joined in any log aggregator.
 *
 * Requires correlationId middleware to run first.
 */
export const requestLogger = (req, res, next) => {
  const startAt = process.hrtime.bigint();

  const log = createRequestLogger({
    correlationId: req.correlationId,
    requestId: req.requestId,
    userId: req.user?.id ?? null,
  });

  // ── Incoming request log ────────────────────────────────────────────────

  log.info("REQUEST", {
    event: "request_received",
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: sanitizeHeaders(req.headers),
    body: resolveBodyForLog(req),
    ip: req.ip ?? req.socket?.remoteAddress,
    userAgent: req.headers["user-agent"],
  });

  // ── Outgoing response log ────────────────────────────────────────────────
  // Hook into res.end so we capture the final status after all middleware

  const originalEnd = res.end.bind(res);

  res.end = function (chunk, encoding, callback) {
    // Restore immediately so the real send can proceed
    res.end = originalEnd;
    originalEnd(chunk, encoding, callback);

    const durationNs = process.hrtime.bigint() - startAt;
    const durationMs = Number(durationNs) / 1_000_000;

    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    log[level]("RESPONSE", {
      event: "request_completed",
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: parseFloat(durationMs.toFixed(3)),
      contentLength: res.getHeader("content-length") ?? null,
      correlationId: req.correlationId,
      requestId: req.requestId,
    });
  };

  next();
};

/**
 * Convenience export: both middlewares in the right order.
 * Use in app.js as: app.use(...requestLogging)
 */
export { sanitizeHeaders, sanitizeBody };
