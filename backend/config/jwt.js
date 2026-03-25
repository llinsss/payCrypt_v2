import jwt from "jsonwebtoken";

/**
 * JWT Configuration with security best practices
 * - No fallback secrets (fails fast if not configured)
 * - Issuer and audience claims for additional validation
 * - Centralized configuration for consistency
 */

// Validate JWT_SECRET at startup
if (!process.env.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET environment variable is not set!");
  console.error("   Set JWT_SECRET in your .env file before starting the server.");
  process.exit(1);
}

// Validate JWT_SECRET strength
if (process.env.JWT_SECRET.length < 32) {
  console.error("❌ FATAL: JWT_SECRET must be at least 32 characters long!");
  console.error("   Use a strong, randomly generated secret.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
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
    expiresIn: "24h",
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
  verifyToken,
  verifyTokenCallback,
  JWT_SECRET, // Export for legacy code that needs direct access
  JWT_ISSUER,
  JWT_AUDIENCE,
};
