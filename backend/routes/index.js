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
import webhookRoutes from "./webhooks.js";
import webhookAdminRoutes from "./webhookAdmin.js";
import exportRoutes from "./exports.js";
import ussdRoutes from "./ussd.js";
import { deprecationWarning } from "../middleware/apiVersion.js";

const router = express.Router();

const registerRoutes = (router) => {
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
  router.use("/webhooks", webhookRoutes);
  router.use("/admin/webhooks", webhookAdminRoutes);
  router.use("/exports", exportRoutes);
  router.use("/ussd", ussdRoutes);
};

// V1 routes (deprecated)
const v1Router = express.Router();
v1Router.use(deprecationWarning('v1', '2025-12-31'));
registerRoutes(v1Router);
router.use("/v1", v1Router);

// V2 routes (current)
const v2Router = express.Router();
registerRoutes(v2Router);
router.use("/v2", v2Router);

// Default to v2 for backward compatibility
registerRoutes(router);

export default router;
