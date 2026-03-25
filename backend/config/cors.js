/**
 * Shared CORS configuration.
 *
 * Rules:
 *  - Production REQUIRES an explicit CORS_ORIGIN env var.
 *    The app will not start without it (avoids silent wildcard exposure).
 *  - Non-production falls back to a safe localhost allowlist when CORS_ORIGIN
 *    is not set. The wildcard "*" is never used because credentials: true and
 *    Access-Control-Allow-Origin: * are rejected by every modern browser.
 */

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

// Development-only safe default – explicit origins so credentials work.
const DEV_DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

/**
 * Parse and validate the CORS_ORIGIN environment variable.
 * Throws at startup in production when the var is absent.
 *
 * @returns {string[]} Array of allowed origin strings.
 */
function resolveOrigins() {
  const raw = process.env.CORS_ORIGIN;

  if (!raw) {
    if (isProduction) {
      throw new Error(
        "CORS_ORIGIN environment variable must be set in production. " +
          "Example: CORS_ORIGIN=https://app.example.com,https://admin.example.com"
      );
    }
    return DEV_DEFAULT_ORIGINS;
  }

  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN is set but contains no valid origins.");
  }

  if (origins.includes("*")) {
    if (isProduction) {
      throw new Error(
        "CORS_ORIGIN=* is not allowed in production. " +
          "Provide explicit origins (e.g. https://app.example.com)."
      );
    }
    // In development the developer explicitly chose wildcard.
    // Disable credentials so the browser doesn't reject the response.
    return { wildcard: true };
  }

  return origins;
}

const resolved = resolveOrigins();
const isWildcard = resolved?.wildcard === true;

/**
 * CORS options for express-cors middleware (app.js).
 */
export const corsOptions = {
  origin: isWildcard ? "*" : resolved,
  credentials: !isWildcard,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-api-key",
    "x-request-id",
  ],
  exposedHeaders: [
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "Retry-After",
  ],
  maxAge: 3600,
};

/**
 * CORS options for Socket.io – uses the same origin allowlist so HTTP and
 * WebSocket policies are always in sync.
 */
export const socketCorsOptions = {
  origin: isWildcard ? "*" : resolved,
  methods: ["GET", "POST"],
  credentials: !isWildcard,
};
