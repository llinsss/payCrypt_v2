import jwt from "jsonwebtoken";

/**
 * JWT Configuration with security best practices
 * - No fallback secrets (fails fast if not configured)
 * - Issuer and audience claims for additional validation
 * - Centralized configuration for consistency
 */

// Validate JWT_SECRET at startup. Tests use an isolated fallback so importing
// modules does not terminate Jest before individual unit tests can set mocks.
//
// This throws a regular Error instead of calling process.exit(1) (issue
// #507): process.exit kills the whole Jest worker process, which makes a bad
// config untestable and can take unrelated test files down with it. A thrown
// Error surfaces as a normal module-load failure that a test can assert on
// (e.g. via a dynamic `import()` wrapped in `expect(...).rejects.toThrow()`),
// while still failing production startup just as hard — an uncaught
// exception at import time still crashes the process, it just does so via
// the normal Node error path instead of an explicit exit call.
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "test") {
  throw new Error(
    "FATAL: JWT_SECRET environment variable is not set! " +
      "Set JWT_SECRET in your .env file before starting the server.",
  );
}

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-with-at-least-32-characters";

// Validate JWT_SECRET strength
if (JWT_SECRET.length < 32 && process.env.NODE_ENV !== "test") {
  throw new Error(
    "FATAL: JWT_SECRET must be at least 32 characters long! " +
      "Use a strong, randomly generated secret.",
  );
}
const JWT_ISSUER = process.env.JWT_ISSUER || "tagged-backend";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "tagged-api";

/**
 * Sign a JWT token with standard claims
 * @param {Object} payload - Token payload (userId, etc.)
 * @param {Object} options - Additional JWT options
 * @returns {string} Signed JWT token
 */
export const signToken = (payload, options = {}) => {
  const defaultOptions = {
    expiresIn: "15m",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };

  return jwt.sign(payload, JWT_SECRET, {
    ...defaultOptions,
    ...options,
  });
};

/**
 * Sign a refresh token with longer expiry
 * @param {Object} payload - Token payload (userId, etc.)
 * @param {Object} options - Additional JWT options
 * @returns {string} Signed JWT token
 */
export const signRefreshToken = (payload, options = {}) => {
  const defaultOptions = {
    expiresIn: "30d",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };

  return jwt.sign(payload, JWT_SECRET, {
    ...defaultOptions,
    ...options,
  });
};

/**
 * Verify a JWT token with standard claims validation
 * @param {string} token - JWT token to verify
 * @param {Object} options - Additional verification options
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid
 */
export const verifyToken = (token, options = {}) => {
  const defaultOptions = {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };

  return jwt.verify(token, JWT_SECRET, {
    ...defaultOptions,
    ...options,
  });
};

/**
 * Verify token with callback (for backward compatibility)
 * @param {string} token - JWT token to verify
 * @param {Function} callback - Callback function (err, decoded)
 */
export const verifyTokenCallback = (token, callback) => {
  try {
    const decoded = verifyToken(token);
    callback(null, decoded);
  } catch (err) {
    callback(err, null);
  }
};

export default {
  signToken,
  signRefreshToken,
  verifyToken,
  verifyTokenCallback,
  JWT_SECRET, // Export for legacy code that needs direct access
  JWT_ISSUER,
  JWT_AUDIENCE,
};
