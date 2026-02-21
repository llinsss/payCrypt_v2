import express from "express";
import authRoutes from "./auth.js";
import balancesRoutes from "./balances.js";
import userRoutes from "./users.js";
import kycRoutes from "./kycs.js";
import transactionRoutes from "./transactions.js";
import tokenRoutes from "./tokens.js";
import chainRoutes from "./chains.js";
import walletRoutes from "./wallets.js";
import bankAccountRoutes from "./bank-accounts.js";
import notificationRoutes from "./notifications.js";
import healthRoutes from "./health.js";
import apiKeysRoutes from "./apiKeys.js";
import scheduledPaymentRoutes from "./scheduledPayments.js";
import disputeRoutes from "./disputes.js";
import auditLogRoutes from "./auditLogs.js";
import performanceRoutes from "./performance.js";
import analyticsRoutes from "./analytics.js";
import exportRoutes from "./exports.js";

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/performance", performanceRoutes);
router.use("/auth", authRoutes);

router.use("/balances", balancesRoutes);
router.use("/users", userRoutes);
router.use("/kycs", kycRoutes);
router.use("/transactions", transactionRoutes);
router.use("/tokens", tokenRoutes);
router.use("/chains", chainRoutes);
router.use("/wallets", walletRoutes);
router.use("/bank-accounts", bankAccountRoutes);
router.use("/notifications", notificationRoutes);
router.use("/api-keys", apiKeysRoutes);
router.use("/scheduled-payments", scheduledPaymentRoutes);
router.use("/disputes", disputeRoutes);
router.use("/audit-logs", auditLogRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/exports", exportRoutes);

export default router;
