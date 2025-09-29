import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

// Import routes
import authRoutes from "./routes/auth.js";
import balancesRoutes from "./routes/balances.js";
import userRoutes from "./routes/users.js";
import kycRoutes from "./routes/kycs.js";
import transactionRoutes from "./routes/transactions.js";
import tokenRoutes from "./routes/tokens.js";
import chainRoutes from "./routes/chains.js";
import walletRoutes from "./routes/wallets.js";
import bankAccountRoutes from "./routes/bank-accounts.js";
import starknet from "./starknet-contract.js";
import { shortString } from "starknet";
import listenForDeposits from "./services/starknetListener.js";
import { cryptoToFiat } from "./utils/amount.js";

import * as freecryptoapi from "./services/free-crypto-api.js";
import * as exchangerateapi from "./services/exchange-rate-api.js";
import db from "./config/database.js";
import pLimit from "p-limit";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const redis = createClient({
  url: process.env.REDIS_URL,
});

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", true);
} else {
  app.set("trust proxy", false);
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

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

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Get crypto rate
app.get("/api/crypto-rate", async (req, res) => {
  const { token } = req.query;
  const data = await freecryptoapi.rate(token);
  res.status(200).json(data);
});

// Get fiat rate
app.get("/api/fiat-rate", async (req, res) => {
  const { currency } = req.query;
  const data = await exchangerateapi.rate(currency);
  res.status(200).json(data);
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/balances", balancesRoutes);
app.use("/api/users", userRoutes);
app.use("/api/kycs", kycRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/chains", chainRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/bank-accounts", bankAccountRoutes);

app.get("/create-tag-wallet-address/:tag", async (req, res) => {
  try {
    const { tag } = req.params;

    const contract = await starknet.getContract();
    // convert string -> felt
    const feltTag = shortString.encodeShortString(tag);

    console.log(tag, feltTag);
    const tx = await contract.register_tag(feltTag);
    console.log(tx);
    await starknet.provider.waitForTransaction(tx.transaction_hash);

    console.log("Raw contract response:", tx);

    return res.json({ tag, tx });
  } catch (error) {
    console.error("Error creating wallet address:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/get-tag-wallet-address/:tag", async (req, res) => {
  try {
    const { tag } = req.params;

    const contract = await starknet.getContract();

    // Encode tag (felt252 from string)
    const feltTag = shortString.encodeShortString(tag);

    // Call the view function
    const raw = await contract.get_tag_wallet_address(feltTag);

    // Handle Starknet.js return shape
    let walletAddress;
    if (Array.isArray(raw)) {
      walletAddress = raw[0];
    } else if (raw?.wallet_address) {
      walletAddress = raw.wallet_address;
    } else if (typeof raw === "bigint") {
      walletAddress = raw;
    } else {
      throw new Error("Unexpected contract return format");
    }

    // Convert BigInt → hex string
    const address = `0x${walletAddress.toString(16)}`;

    return res.json({ tag, address });
  } catch (error) {
    console.error("❌ Error fetching wallet address:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/fetch-transactions/:block_number", async (req, res) => {
  try {
    const { block_number } = req.params;
    const data = await listenForDeposits(block_number);
    return res.json(data);
  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/usd-equivalent", async (req, res) => {
  try {
    const { token, amount } = req.body;
    const data = await cryptoToFiat(token, amount);
    return res.json(data);
  } catch (error) {
    console.error("❌ Error fetching usd equivalent:", error);
    return res.status(500).json({ error: error.message });
  }
});
// 404 handler
app.use("*", (req, res) => {
  res.status(400).json({ error: "Page not found" });
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
const limit = pLimit(5);
const updateTokenPrices = async () => {
  try {
    console.log("⏳ Updating token prices...");

    const tokens = await db("tokens").select("id", "symbol");

    // Create tasks with throttling
    const tasks = tokens.map((token) =>
      limit(async () => {
        try {
          const data = await freecryptoapi.rate(token.symbol);
          const price = data?.last ? Number.parseFloat(data.last) : null;

          if (price && !Number.isNaN(price)) {
            await db("tokens").where({ id: token.id }).update({
              price: price,
              updated_at: new Date(),
            });

            console.log(`✅ Updated ${token.symbol}: ${price}`);
          } else {
            console.warn(`⚠️ Skipping ${token.symbol}, invalid price`);
          }
        } catch (err) {
          console.error(`❌ Error updating ${token.symbol}:`, err.message);
        }
      })
    );

    // Run all tasks with concurrency control
    const results = await Promise.allSettled(tasks);

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.length - successCount;

    console.log(
      `📊 Token price update done: ${successCount} success, ${failCount} failed`
    );
  } catch (err) {
    console.error("❌ Error in updateTokenPrices:", err.message);
  }
};

// Run immediately on startup
updateTokenPrices();

// Run every 1 hour
setInterval(updateTokenPrices, 60 * 60 * 1000);

// setInterval(listenForDeposits, 2000);

redis.on("error", (err) => console.error("❌ Redis Client Error", err));

await redis.connect();

const NGN_KEY = "USD_NGN";
const SIX_HOURS = 6 * 60 * 60; // in seconds

const updateNgnRate = async () => {
  try {
    console.log("⏳ Fetching USD->NGN rate...");

    // Call the exchange API with USD
    const data = await exchangerateapi.rate("USD");

    if (!data || !data.NGN) {
      throw new Error("No NGN rate found in response");
    }

    const ngnValue = Number.parseFloat(data.NGN);

    if (!Number.isNaN(ngnValue)) {
      // Save to Redis with 6h expiry
      await redis.setEx(NGN_KEY, SIX_HOURS, ngnValue.toString());

      console.log(`✅ Cached NGN rate: ${ngnValue}`);
    } else {
      console.warn(
        "⚠️ Invalid NGN value received, skipping Redis cache update"
      );
    }
  } catch (err) {
    console.error("❌ Error updating NGN rate:", err.message);
  }
};

// Run once at startup
updateNgnRate();

// Run every 6 hours
setInterval(updateNgnRate, SIX_HOURS * 1000);
app.get("/api/rates/ngn", async (req, res) => {
  try {
    let ngnValue = await redis.get(NGN_KEY);

    if (!ngnValue) {
      console.log("⚠️ NGN rate not cached, fetching fresh...");
      await updateNgnRate();
      ngnValue = await redis.get(NGN_KEY);
    }

    return res.json({
      USD: 1,
      NGN: Number.parseFloat(ngnValue),
    });
  } catch (err) {
    console.error("❌ Error fetching NGN from Redis:", err.message);
    return res.status(500).json({ error: "Failed to fetch NGN rate" });
  }
});
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

export default app;
