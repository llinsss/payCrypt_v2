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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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
  res.status(404).json({ error: "Page not found" });
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

setInterval(listenForDeposits, 2000);
// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

export default app;
