import express from "express";
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTransactionByUser,
  getTransactionsByTag,
  processPayment,
  getPaymentLimits,
  getPaymentHistory
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

router.get("/", authenticate, getTransactionByUser);
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, getTransactionById);
router.put("/:id", authenticate, paymentLimiter, validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.delete("/:id", authenticate, paymentLimiter, auditLog("transactions"), deleteTransaction);

// Payment operations
router.post("/payment", authenticate, paymentLimiter, validate(processPaymentSchema), auditLog("transactions"), processPayment);
router.post("/batches", authenticate, paymentLimiter, validate(batchPaymentSchema), auditLog("transactions"), createBatchPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/batches/:id", authenticate, getBatchPaymentStatus);
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
