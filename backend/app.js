import "./utils/queueCorrelation.js";
import express from "express";
import * as Sentry from "@sentry/node";
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
import { correlationId } from "./middleware/correlationId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import logger, { stream } from "./utils/logger.js";
import { sanitizeBody as sanitizeSensitiveBody } from "./utils/redactor.js";
import {
  sanitizeRequest,
  detectSqlInjection,
} from "./middleware/validation.js";

import { rateLimit } from "./middleware/rateLimiter.js";
import {
  applyPayloadLimits,
  payloadTooLargeHandler,
} from "./middleware/payloadLimits.js";
import { initSentry } from "./observability/sentry.js";

dotenv.config();

const app = express();

initSentry();

// Custom Sentry Middleware to attach context
app.use((req, res, next) => {
  // Try to use Sentry's newer IsolationScope if available, otherwise just use setContext safely.
  // Actually, Express requests run in their own async context in Node, so we can do this:
  Sentry.setContext("request_body", sanitizeSensitiveBody(req.body || {}));
  Sentry.setContext("request_query", sanitizeSensitiveBody(req.query || {}));
  next();
});

// ===== SECURITY MIDDLEWARE =====

// Helmet for HTTP security headers
// Configured to OWASP recommendations for financial APIs (issue #458).
app.use(
  helmet({
    // Content-Security-Policy: tightly restrict where resources can be loaded from.
    // This is an API backend — no inline scripts or external CDN sources are needed.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        mediaSrc: ["'none'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // HSTS: 2 years, includeSubDomains, preload — required for HSTS preload list
    hsts: {
      maxAge: 63072000, // 2 years in seconds
      includeSubDomains: true,
      preload: true,
    },
    // Prevent clickjacking — no framing allowed
    frameguard: { action: "deny" },
    // Prevent MIME-type sniffing
    noSniff: true,
    // Referrer policy — only send origin on same-origin, omit cross-origin
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // Cross-Origin-Opener-Policy: prevent cross-origin attacks via window references
    crossOriginOpenerPolicy: { policy: "same-origin" },
    // Cross-Origin-Resource-Policy: block cross-origin reads of our resources
    crossOriginResourcePolicy: { policy: "same-origin" },
    // Cross-Origin-Embedder-Policy: require CORP for embedded resources
    crossOriginEmbedderPolicy: { policy: "require-corp" },
    // DNS prefetch control
    dnsPrefetchControl: { allow: false },
    // Disable IE compatibility mode
    ieNoOpen: true,
    // Disable X-Powered-By header (also done via helmet default)
    hidePoweredBy: true,
  }),
);

// Permissions-Policy: restrict access to sensitive browser features not needed by this API
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  );
  next();
});

// CORS configuration — origin and credentials resolved from config/cors.js.
// In production CORS_ORIGIN must be set; the app will not start without it.
app.use(cors(corsOptions));

// Global rate limiting (applies to all routes)
app.use(rateLimit({ endpointName: "api", windowMs: 60 * 60 * 1000, max: 1000 }));

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

// Request body parsing with tiered size limits.
//
// A single 10mb limit applied everywhere meant any endpoint could be used to
// buffer 10mb of attacker-supplied JSON. Limits are now scoped per route class
// (10kb auth / 50kb default / 10mb upload) — see middleware/payloadLimits.js.
//
// Each parser preserves the raw request buffer so webhook handlers (e.g.
// Paystack) can verify HMAC signatures against the exact bytes received rather
// than the re-serialized JSON.
applyPayloadLimits(app);

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

// Request/Response Logging with Correlation IDs
app.use(correlationId);
app.use((req, res, next) => {
  Sentry.setTag("correlationId", req.correlationId);
  Sentry.setTag("requestId", req.requestId);
  next();
});
app.use(requestLogger);

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

// Test route for user verification of Sentry. Never expose this deliberately
// failing endpoint to production traffic.
if (process.env.NODE_ENV !== "production") {
  app.get("/test-error", (req, res) => {
    throw new Error("Sentry Test Error manually triggered");
  });
}

import rateLimitRoutes from "./routes/rateLimit.js";

app.use("/", generalRoutes);
app.use("/api", indexRoutes);

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
      description:
        "API documentation for the Tagg@d backend — a crypto payment platform for Africa. " +
        "Routes are available under /api (current version alias), " +
        "/api/v2 (current), and /api/v1 (deprecated — see GET /api/versions for sunset details).\n\n" +
        "**Authentication:** Most endpoints require a JWT Bearer token obtained via `POST /api/auth/login`. " +
        "Alternatively, API keys can be used for third-party integrations (see `POST /api/api-keys`).\n\n" +
        "**Getting Started:** See the [Getting Started guide](https://taggedpay.xyz/docs/api/getting-started) for a complete walkthrough: " +
        "register → get JWT → create wallet → send payment.",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5002}/api/v2`,
        description: "Current version (v2)",
      },
      {
        url: `http://localhost:${process.env.PORT || 5002}/api/v1`,
        description: "Deprecated version (v1)",
      },
      {
        url: `http://localhost:${process.env.PORT || 5002}`,
        description: "Development Server (unversioned root)",
      },
      {
        url: "https://taggedpay.xyz/api/v2",
        description: "Production (v2)",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "JWT token obtained from POST /api/auth/login. Send as `Authorization: Bearer <token>`.",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description:
            "API key for third-party integrations. Send as `x-api-key: <key>`. Create via POST /api/api-keys.",
        },
      },
    },
  },
  apis: ["./routes/*.js"], // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

// ===== PUBLIC API SPEC ENDPOINT (unauthenticated, rate-limited) =====
// Expose the full OpenAPI 3.0 spec as JSON for third-party developers,
// Postman collection generation, and static doc site builds.
app.get(
  "/api/docs-json",
  rateLimit({ endpointName: "docs-json", windowMs: 60 * 60 * 1000, max: 100 }),
  (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Access-Control-Allow-Origin",
      process.env.CORS_ORIGIN || "*",
    );
    res.status(200).json(swaggerDocs);
  },
);

// ===== SWAGGER UI (protected with basic auth) =====
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

// Oversized request bodies get a described 413 rather than a bare status.
app.use(payloadTooLargeHandler);

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
