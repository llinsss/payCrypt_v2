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
import backupAdminRoutes from "./backupAdmin.js";
import exportRoutes from "./exports.js";
import ussdRoutes from "./ussd.js";
import batchPaymentRoutes from "./batchPayments.js";
import keyRoutes from "./keys.js";
import tagRoutes from "./tagRoutes.js";
import withdrawalRoutes from "./withdrawals.js";
import stellarStreamRoutes from "./stellarStream.js";
import { versionHeaders, CURRENT_VERSION, DEPRECATIONS } from "../middleware/apiVersion.js";

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
  router.use("/admin/backups", backupAdminRoutes);
  router.use("/exports", exportRoutes);
  router.use("/ussd", ussdRoutes);
  router.use("/batches", batchPaymentRoutes);
  router.use("/keys", keyRoutes);
  router.use("/tags", tagRoutes);
  router.use("/withdrawals", withdrawalRoutes);
  router.use("/stellar-stream", stellarStreamRoutes);
};

router.get("/versions", (req, res) => {
  const versions = new Set([1, CURRENT_VERSION]);
  res.status(200).json({
    current: CURRENT_VERSION,
    versions: Array.from(versions)
      .sort((a, b) => a - b)
      .map((version) => {
        const deprecation = DEPRECATIONS[version];
        return {
          version,
          status: deprecation ? "deprecated" : version === CURRENT_VERSION ? "current" : "supported",
          ...(deprecation && {
            deprecatedAt: deprecation.deprecatedAt.toISOString(),
            sunset: deprecation.sunsetAt.toISOString(),
            migrationGuide: deprecation.migrationGuide,
          }),
        };
      }),
  });
});

const v1Router = express.Router();
v1Router.use(versionHeaders(1));
registerRoutes(v1Router);
router.use("/v1", v1Router);

const v2Router = express.Router();
v2Router.use(versionHeaders(CURRENT_VERSION));
registerRoutes(v2Router);
router.use("/v2", v2Router);

router.use(versionHeaders(CURRENT_VERSION));
registerRoutes(router);

export default router;