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
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { paymentLimiter, exportLimiter, downloadLimiter } from "../config/rateLimiting.js";
import { idempotency } from "../middleware/idempotency.js";

const router = express.Router();

router.get("/search", authenticate, userRateLimiter, searchTransactions);
router.get("/", authenticate, userRateLimiter, getTransactionByUser);
router.get("/export/download", downloadLimiter, downloadExport);
router.get("/export", authenticateJwtOrApiKey, userRateLimiter, exportLimiter, exportTransactions);
router.get("/tag/:tag", validateParams(transactionTagParamSchema), validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, userRateLimiter, validateParams(transactionIdParamSchema), getTransactionById);
router.put("/:id", authenticate, userRateLimiter, paymentLimiter, validateParams(transactionIdParamSchema), validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.delete("/:id", authenticate, userRateLimiter, paymentLimiter, validateParams(transactionIdParamSchema), auditLog("transactions"), deleteTransaction);

// Payment operations
// Payment operations
router.post("/payment", authenticate, paymentLimiter, idempotency, validate(processPaymentSchema), auditLog("transactions"), processPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
