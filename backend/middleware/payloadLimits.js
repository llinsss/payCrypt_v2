import express from "express";
import * as Sentry from "@sentry/node";

import logger from "../utils/logger.js";

/**
 * Request payload size limits.
 *
 * Express imposes no body size limit of its own, so without these an attacker
 * can post an arbitrarily large JSON document to any endpoint and have the
 * process buffer it in memory — a cheap and effective denial of service.
 *
 * Three tiers, because one number cannot serve every endpoint:
 *
 *   auth     – credentials and OTPs are tiny. A login body has no legitimate
 *              reason to approach even 10kb, and auth endpoints are the ones most
 *              likely to be probed, so they get the tightest bound.
 *   default  – ordinary JSON APIs. 50kb comfortably fits the largest batch
 *              payloads the API accepts while staying far below anything that
 *              threatens memory.
 *   upload   – KYC document submission, which carries base64-encoded images and
 *              genuinely needs headroom. Scoped to those routes only, so the
 *              wide limit is not available anywhere else.
 */
export const PAYLOAD_LIMITS = Object.freeze({
  auth: "10kb",
  default: "50kb",
  upload: "10mb",
});

/**
 * Route prefixes that need the upload-sized limit.
 *
 * Kept explicit rather than pattern-matched: a wide body limit is a security
 * control being relaxed, so it should be obvious which paths have it.
 */
export const UPLOAD_PATHS = Object.freeze(["/api/kycs"]);

/** Route prefixes holding credentials, which get the tightest limit. */
export const AUTH_PATHS = Object.freeze(["/api/auth"]);

/**
 * Preserve the raw request buffer.
 *
 * Webhook handlers verify HMAC signatures against the exact bytes received, so
 * the raw body has to survive parsing. Every parser below installs this.
 */
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf;
};

/** JSON body parser bound to a specific limit. */
export const jsonWithLimit = (limit) =>
  express.json({ limit, verify: captureRawBody });

/** Form body parser bound to a specific limit. */
export const urlencodedWithLimit = (limit) =>
  express.urlencoded({ extended: true, limit });

/**
 * Install the tiered body parsers on an app.
 *
 * Order matters. body-parser marks a request as parsed and later parsers skip
 * it, so the first matching parser wins — the narrow and wide tiers must be
 * mounted on their paths *before* the catch-all default.
 */
export function applyPayloadLimits(app) {
  for (const path of AUTH_PATHS) {
    app.use(path, jsonWithLimit(PAYLOAD_LIMITS.auth));
    app.use(path, urlencodedWithLimit(PAYLOAD_LIMITS.auth));
  }

  for (const path of UPLOAD_PATHS) {
    app.use(path, jsonWithLimit(PAYLOAD_LIMITS.upload));
    app.use(path, urlencodedWithLimit(PAYLOAD_LIMITS.upload));
  }

  app.use(jsonWithLimit(PAYLOAD_LIMITS.default));
  app.use(urlencodedWithLimit(PAYLOAD_LIMITS.default));
}

/** Which limit applies to a given request path, for error reporting. */
export function limitForPath(path = "") {
  if (AUTH_PATHS.some((prefix) => path.startsWith(prefix))) {
    return PAYLOAD_LIMITS.auth;
  }
  if (UPLOAD_PATHS.some((prefix) => path.startsWith(prefix))) {
    return PAYLOAD_LIMITS.upload;
  }
  return PAYLOAD_LIMITS.default;
}

/**
 * Turn body-parser's size error into a described 413.
 *
 * body-parser raises `entity.too.large` with a 413 status but no useful body, so
 * without this the client receives an empty response and cannot tell a size
 * rejection apart from a server fault.
 *
 * Oversized requests are reported to Sentry: a single one is usually a client
 * bug, but a stream of them is what a memory-exhaustion attempt looks like.
 */
export function payloadTooLargeHandler(err, req, res, next) {
  const isTooLarge =
    err?.type === "entity.too.large" ||
    (err?.status === 413 && err?.expected !== undefined) ||
    err?.statusCode === 413;

  if (!isTooLarge) {
    return next(err);
  }

  const limit = limitForPath(req.path);
  const context = {
    path: req.path,
    method: req.method,
    limit,
    contentLength: req.headers["content-length"] ?? "unknown",
    ip: req.ip,
  };

  logger.warn("Rejected oversized request payload", context);

  try {
    Sentry.captureMessage("Oversized request payload rejected", {
      level: "warning",
      extra: context,
    });
  } catch {
    // Never let telemetry failure turn a handled 413 into a 500.
  }

  return res.status(413).json({
    error: "Payload Too Large",
    message: `Request body exceeds the ${limit} limit for this endpoint. Reduce the payload size and try again.`,
    limit,
  });
}
