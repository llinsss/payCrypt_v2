import jwt from "jsonwebtoken";
import db from "../config/database.js";
import { createUserRateLimiter } from "../config/rateLimiting.js";

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
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
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
