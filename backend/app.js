import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

// Import routes

import {
  SIX_HOURS,
  updateNgnRate,
  updateTokenPrices,
} from "./config/initials.js";

dotenv.config();

const app = express();

// CORS (configure origins in production)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// Helmet for HTTP headers
app.use(helmet());

// Prevent XSS attacks
app.use(xss());

// Prevent NoSQL injection
app.use(mongoSanitize());

// Prevent HTTP parameter pollution
app.use(hpp());

// Compression (gzip responses)
app.use(compression());

// Request body parsing
app.use(express.json({ limit: "10kb" })); // protect from large payload attacks

// Logging (only in development)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 mins
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);
// Middleware
app.use(helmet());

// CORS configuration for production
const corsOptions = {
  origin: "*",
  // process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(limiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// API routes
// updateTokenPrices();

// updateNgnRate();

// setInterval(updateNgnRate, SIX_HOURS * 1000);

// setInterval(updateTokenPrices, 60 * 60 * 1000);

// setInterval(listenForDeposits, 2000);

// --- Routes ---
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to Tagg@d API service 🚀",
    environment: process.env.NODE_ENV,
  });
});

import tagRoutes from "./routes/tagRoutes.js";

app.use("/", generalRoutes);
app.use("/api", indexRoutes);
app.use("/api/tags", tagRoutes);

app.use(
  "/admin/running-queues",
  basicAuth({
    users: { admin: process.env.BULL_ADMIN_PASS || "tagg@d" },
    challenge: true,
  }),
  bullBoardRouter.getRouter()
);

app.all("*", (req, res, next) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error(error.stack);

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  res.status(500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error.message,
  });
});

export default app;
