import express from "express";
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  getTransactionReceipt,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  getTransactionByUser,
  getTransactionsByTag,
  processPayment,
  getPaymentLimits,
  getPaymentHistory,
  updateTransactionNote,
  searchTransactions
} from "../controllers/transactionController.js";
import {
  authenticateJwtOrApiKey,
  userRateLimiter
} from "../middleware/auth.js";
import { requireApiKeyScope } from "../middleware/apiKeyAuth.js";
import { validate, validateQuery, validateParams } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { rateLimit } from "../middleware/rateLimiter.js";

const router = express.Router();

// Read-only routes - requires transactions:read scope for API keys (JWT users bypass scope check)
router.get("/search", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), requireApiKeyScope(["transactions:read"]), searchTransactions);
router.get("/", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), requireApiKeyScope(["transactions:read"]), getTransactionByUser);
router.get("/export/download", rateLimit({ endpointName: "download", windowMs: 15 * 60 * 1000, max: 10 }), downloadExport);
router.get("/export", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "export", windowMs: 60 * 60 * 1000, max: 5 }), requireApiKeyScope(["transactions:read"]), exportTransactions);
router.get("/tag/:tag", authenticateJwtOrApiKey, userRateLimiter, validateParams(transactionTagParamSchema), validateQuery(transactionQuerySchema), requireApiKeyScope(["transactions:read"]), getTransactionsByTag);
router.get("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), validateParams(transactionIdParamSchema), requireApiKeyScope(["transactions:read"]), getTransactionById);

// Write routes - requires transactions:write scope for API keys (JWT users bypass scope check)
router.put("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), validate(transactionSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write"]), updateTransaction);
router.delete("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write"]), deleteTransaction);

// Payment operations - requires transactions:write or payments:send scope
router.post("/payment", authenticateJwtOrApiKey, rateLimit({ endpointName: "transactions" }), validate(processPaymentSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write", "payments:send"]), processPayment);
router.post("/batches", authenticateJwtOrApiKey, rateLimit({ endpointName: "transactions" }), validate(batchPaymentSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write", "payments:send"]), createBatchPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/tag/:tag/history", authenticateJwtOrApiKey, userRateLimiter, requireApiKeyScope(["transactions:read"]), getPaymentHistory);

export default router;
