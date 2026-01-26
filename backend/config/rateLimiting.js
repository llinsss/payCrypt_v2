import rateLimit from "express-rate-limit";
import redis from "redis";
import RedisStore from "rate-limit-redis";

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  legacyMode: true,
});

redisClient.connect().catch(console.error);

/**
 * Global Rate Limiter
 * 15 requests per minute per IP
 */
export const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15,
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
});

/**
 * Account Creation Rate Limiter
 * 5 requests per hour per IP
 */
export const accountCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many accounts created from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.ip;
  },
});

/**
 * Payment Rate Limiter
 * 100 requests per hour per API key
 */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: "Too many payment requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Rate limit by API key if available, otherwise by user ID or IP
    return req.headers["x-api-key"] || req.user?.id || req.ip;
  },
});

/**
 * Balance Query Rate Limiter
 * 1000 requests per hour per API key
 */
export const balanceQueryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: "Too many balance queries, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Rate limit by API key if available, otherwise by user ID or IP
    return req.headers["x-api-key"] || req.user?.id || req.ip;
  },
});

/**
 * Authentication Rate Limiter
 * 10 failed login attempts per 15 minutes
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many failed login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed requests
  keyGenerator: (req, res) => {
    return req.body.email || req.ip;
  },
});

/**
 * Strict Rate Limiter
 * For sensitive operations - 5 requests per hour per user/API key
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many requests to this sensitive operation, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.headers["x-api-key"] || req.user?.id || req.ip;
  },
});

export default {
  globalLimiter,
  accountCreationLimiter,
  paymentLimiter,
  balanceQueryLimiter,
  loginLimiter,
  strictLimiter,
};
