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
  createBatchPayment,
  getBatchPaymentStatus,
} from "../controllers/batchController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { batchPaymentSchema, processPaymentSchema } from "../schemas/payment.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

router.get("/search", authenticate, userRateLimiter, validateQuery(transactionSearchQuerySchema), searchTransactions);
router.get("/", authenticate, userRateLimiter, validateQuery(transactionQuerySchema), getTransactionByUser);
router.get("/export/download", downloadExport);
router.get("/export", authenticateJwtOrApiKey, userRateLimiter, exportLimiter, exportTransactions);
router.get("/tag/:tag", validateParams(transactionTagParamSchema), validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, userRateLimiter, validateParams(transactionIdParamSchema), getTransactionById);
router.put("/:id", authenticate, userRateLimiter, paymentLimiter, validateParams(transactionIdParamSchema), validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.delete("/:id", authenticate, userRateLimiter, paymentLimiter, validateParams(transactionIdParamSchema), auditLog("transactions"), deleteTransaction);

// Payment operations
router.post("/payment", authenticate, paymentLimiter, validate(processPaymentSchema), auditLog("transactions"), processPayment);
router.post("/batches", authenticate, paymentLimiter, validate(batchPaymentSchema), auditLog("transactions"), createBatchPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/batches/:id", authenticate, getBatchPaymentStatus);
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
