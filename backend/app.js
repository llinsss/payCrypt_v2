import express from "express";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import compression from "compression";
import morgan from "morgan";
import hpp from "hpp";
import xss from "xss-clean";
import basicAuth from "express-basic-auth";
import mongoSanitize from "express-mongo-sanitize";

import indexRoutes from "./routes/index.js";
import generalRoutes from "./routes/general.js";
import bullBoardRouter from "./bullboard.js";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import {
  SIX_HOURS,
  updateNgnRate,
  updateTokenPrices,
} from "./config/initials.js";
import { corsOptions } from "./config/cors.js";

import { performanceMonitor } from "./middleware/performance.js";
import { versionDetection } from "./middleware/apiVersion.js";
import logger, { stream } from "./utils/logger.js";
import {
  sanitizeRequest,
  detectSqlInjection,
} from "./middleware/validation.js";

import {
  globalLimiter,
  accountCreationLimiter,
  paymentLimiter,
  balanceQueryLimiter,
  loginLimiter,
} from "./config/rateLimiting.js";

dotenv.config();

const app = express();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  integrations: [nodeProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});

// Custom Sentry Middleware to attach context
app.use((req, res, next) => {
  // Try to use Sentry's newer IsolationScope if available, otherwise just use setContext safely.
  // Actually, Express requests run in their own async context in Node, so we can do this:
  Sentry.setContext("request_body", req.body || {});
  Sentry.setContext("request_query", req.query || {});
  next();
});

// ===== SECURITY MIDDLEWARE =====

// Helmet for HTTP security headers
app.use(
  helmet({
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
  }),
);

// CORS configuration — origin and credentials resolved from config/cors.js.
// In production CORS_ORIGIN must be set; the app will not start without it.
app.use(cors(corsOptions));

// Global rate limiting (applies to all routes)
app.use(globalLimiter);

// Prevent XSS attacks
app.use(xss());

// Prevent NoSQL injection
app.use(mongoSanitize());

// Prevent HTTP parameter pollution
app.use(
  hpp({
    whitelist: [
      // Add query params that should be allowed as arrays
      "sort",
      "fields",
      "filter",
    ],
  }),
);

// Compression (gzip responses)
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Compression level (0-9, 6 is default balance)
  }),
);

// Request body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Detect SQL Injection attempts
app.use(detectSqlInjection);

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

// API Version Detection
app.use("/api", versionDetection);

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

// Test route for user verification of Sentry
app.get("/test-error", (req, res) => {
  throw new Error("Sentry Test Error manually triggered");
});

import tagRoutes from "./routes/tagRoutes.js";
import rateLimitRoutes from "./routes/rateLimit.js";

app.use("/", generalRoutes);
app.use("/api", indexRoutes);
app.use("/api/tags", tagRoutes);
import withdrawalRoutes from "./routes/withdrawals.js";
app.use("/api/withdrawals", withdrawalRoutes);

// Rate limit admin routes
app.use("/admin/rate-limits", rateLimitRoutes);

// Admin routes with basic auth and rate limiting
if (!process.env.BULL_ADMIN_USER || !process.env.BULL_ADMIN_PASS) {
  throw new Error("BULL_ADMIN_USER and BULL_ADMIN_PASS env vars must be set");
}
app.use(
  "/admin/running-queues",
  basicAuth({
    users: { [process.env.BULL_ADMIN_USER]: process.env.BULL_ADMIN_PASS },
    challenge: true,
  }),
  bullBoardRouter.getRouter(),
);

// Swagger Documentation setup
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Tagg@d API",
      version: "1.0.0",
      description: "API documentation for the Tagg@d backend",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5002}`,
        description: "Development Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./routes/*.js"], // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

if (!process.env.SWAGGER_ADMIN_USER || !process.env.SWAGGER_ADMIN_PASS) {
  throw new Error(
    "SWAGGER_ADMIN_USER and SWAGGER_ADMIN_PASS env vars must be set",
  );
}
app.use(
  "/api-docs",
  basicAuth({
    users: { [process.env.SWAGGER_ADMIN_USER]: process.env.SWAGGER_ADMIN_PASS },
    challenge: true,
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs),
);

// ===== ERROR HANDLING =====

app.all("*", (req, res, next) => {
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`,
    path: req.originalUrl,
    method: req.method,
  });
});

// Setup Sentry error handler
Sentry.setupExpressErrorHandler(app);

// Global error handler
app.use((error, req, res, next) => {
  const isDev = process.env.NODE_ENV !== "production";

  logger.error({
    message: error.message,
    status: error.status || 500,
    method: req.method,
    url: req.originalUrl,
    requestId: req.headers["x-request-id"] || null,
    ...(isDev && { stack: error.stack }),
  });

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
    error: isDev ? error.message : "Internal server error",
  });
});

export default app;
