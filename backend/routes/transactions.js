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
import { authenticate, userRateLimiter } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

router.get("/", authenticate, userRateLimiter, getTransactionByUser);
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, userRateLimiter, getTransactionById);
router.put("/:id", authenticate, userRateLimiter, paymentLimiter, validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.delete("/:id", authenticate, userRateLimiter, paymentLimiter, auditLog("transactions"), deleteTransaction);

// Payment operations
router.post("/payment", authenticate, userRateLimiter, paymentLimiter, validate(processPaymentSchema), auditLog("transactions"), processPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
