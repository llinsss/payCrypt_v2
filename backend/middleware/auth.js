import db from "../config/database.js";
import { createUserRateLimiter, createTierRateLimiter } from "../config/rateLimiting.js";
import * as Sentry from "@sentry/node";
import { verifyToken } from "../config/jwt.js";
import { ACCESS_COOKIE } from "../utils/authCookies.js";

export const requireAdmin = (req, res, next) => {
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const isAdmin = requireAdmin;

/** Restricts a route to super_admin only (for elevated operations). */
export const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

export const authenticate = async (req, res, next) => {
  try {
    const bearerToken = req.headers.authorization?.split(" ")[1];
    const token = bearerToken || req.cookies?.[ACCESS_COOKIE];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }
    const decoded = verifyToken(token);
    if (!bearerToken && decoded.sessionId) {
      const session = await db("auth_sessions").where({ id: decoded.sessionId, user_id: decoded.userId }).whereNull("revoked_at").where("expires_at", ">", new Date()).first();
      if (!session) return res.status(401).json({ error: "Session expired" });
    }
    const legacyBearerUntil = Date.parse(process.env.LEGACY_BEARER_AUTH_UNTIL || "");
    if (bearerToken && (process.env.LEGACY_BEARER_AUTH_ENABLED !== "true" || !Number.isFinite(legacyBearerUntil) || Date.now() >= legacyBearerUntil)) return res.status(401).json({ error: "Bearer authentication is disabled" });
    const user = await db("users").where({ id: decoded.userId }).first();
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = user;
    Sentry.setUser({ id: user.id, username: user.username, email: user.email });
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const authenticateJwtOrApiKey = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  const apiKey = req.headers["x-api-key"];
  if (apiKey) {
    return authenticateApiKey(req, res, next);
  }
  if (token) {
    return authenticate(req, res, next);
  }
  return res.status(401).json({ error: "Access token or API key required" });
};

/**
 * Per-user tier-based rate limiter - use after authenticate for protected routes
 * Uses Redis sliding window; keys by user ID
 * Respects user tier: FREE=100 req/min, PREMIUM=1000 req/min
 */
export const userRateLimiter = createTierRateLimiter({
  type: "user",
  message: "Too many requests from this user, please try again later",
});

/**
 * Authenticate + per-user rate limiting (convenience for protected routes)
 */
export const authenticateWithRateLimit = [authenticate, userRateLimiter];