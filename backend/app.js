import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import compression from "compression";
import morgan from "morgan";
import hpp from "hpp";
import xss from "xss-clean";
import basicAuth from "express-basic-auth";
import mongoSanitize from "express-mongo-sanitize";
import transactionTagRoutes from "./routes/transactionTagRoutes.js";

import indexRoutes from "./routes/index.js";
import generalRoutes from "./routes/general.js";
import bullBoardRouter from "./bullboard.js";

import {
  SIX_HOURS,
  updateNgnRate,
  updateTokenPrices,
} from "./config/initials.js";

import { performanceMonitor } from "./middleware/performance.js";
import logger, { stream } from "./utils/logger.js";
import { sanitizeRequest } from "./middleware/validation.js";

import {
  globalLimiter,
  accountCreationLimiter,
  paymentLimiter,
  balanceQueryLimiter,
  loginLimiter,
} from "./config/rateLimiting.js";

dotenv.config();

const app = express();

// ===== SECURITY MIDDLEWARE =====

// Helmet for HTTP security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: "deny" },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(",") || ["*"],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-request-id"],
  maxAge: 3600,
};
app.use(cors(corsOptions));

// Global rate limiting (applies to all routes)
app.use(globalLimiter);

// Prevent XSS attacks
app.use(xss());

// Prevent NoSQL injection
app.use(mongoSanitize());

// Prevent HTTP parameter pollution
app.use(hpp({
  whitelist: [
    // Add query params that should be allowed as arrays
    "sort",
    "fields",
    "filter",
  ],
}));

// Compression (gzip responses)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses > 1KB
  level: 6, // Compression level (0-9, 6 is default balance)
}));

// Request body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Sanitize all request inputs
app.use(sanitizeRequest);

// Logging (only in development)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev", { stream }));
} else {
  // Use combined format in production
  app.use(morgan("combined", { stream }));
}

// Performance Monitoring
app.use(performanceMonitor);


// ===== ROUTES =====

app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to Tagg@d API service 🚀",
    environment: process.env.NODE_ENV,
  });
});

// Health check endpoint (no rate limiting)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

import tagRoutes from "./routes/tagRoutes.js";

app.use("/", generalRoutes);
app.use("/api", indexRoutes);
app.use("/api/tags", tagRoutes);

// Admin routes with basic auth and rate limiting
app.use(
  "/admin/running-queues",
  basicAuth({
    users: { admin: process.env.BULL_ADMIN_PASS || "tagg@d" },
    challenge: true,
  }),
  bullBoardRouter.getRouter()
);

// ===== ERROR HANDLING =====

app.all("*", (req, res, next) => {
  res.status(404).json({ 
    message: `Route ${req.originalUrl} not found`,
    path: req.originalUrl,
    method: req.method,
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error(error.stack);

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (error.status === 429) {
    return res.status(429).json({
      error: error.message || "Too many requests",
      retryAfter: error.retryAfter,
    });
  }

  res.status(error.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error.message,
  });
});

export default app;

app.use("/api/transaction-tags", transactionTagRoutes);
