import jwt from "jsonwebtoken";
import db from "../config/database.js";
import { createUserRateLimiter } from "../config/rateLimiting.js";
import * as Sentry from "@sentry/node";

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
 * Per-user rate limiter - use after authenticate for protected routes
 * Uses Redis sliding window; keys by user ID
 */
export const userRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  type: "user",
  message: "Too many requests from this user, please try again later",
});

/**
 * Authenticate + per-user rate limiting (convenience for protected routes)
 */
export const authenticateWithRateLimit = [authenticate, userRateLimiter];
