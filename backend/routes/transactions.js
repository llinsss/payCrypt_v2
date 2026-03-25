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
import { processPaymentSchema } from "../schemas/payment.js";
import { rateLimit } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/search", authenticate, rateLimit({ endpointName: "api" }), searchTransactions);
router.get("/", authenticate, rateLimit({ endpointName: "api" }), getTransactionByUser);
router.get("/export/download", rateLimit({ endpointName: "download", windowMs: 15 * 60 * 1000, max: 10 }), downloadExport);
router.get("/export", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "export", windowMs: 60 * 60 * 1000, max: 5 }), exportTransactions);
router.get("/tag/:tag", validateParams(transactionTagParamSchema), validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, rateLimit({ endpointName: "api" }), validateParams(transactionIdParamSchema), getTransactionById);
router.put("/:id", authenticate, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.delete("/:id", authenticate, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), auditLog("transactions"), deleteTransaction);

// Payment operations
router.post("/payment", authenticate, rateLimit({ endpointName: "transactions" }), validate(processPaymentSchema), auditLog("transactions"), processPayment);
router.post("/batches", authenticate, rateLimit({ endpointName: "transactions" }), validate(batchPaymentSchema), auditLog("transactions"), createBatchPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/batches/:id", authenticate, getBatchPaymentStatus);
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
