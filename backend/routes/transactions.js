import express from "express";
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  getTransactionByUser,
  getTransactionsByTag,
  processPayment,
  getPaymentLimits,
  getPaymentHistory,
  updateTransactionNote
} from "../controllers/transactionController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

router.get("/", authenticate, getTransactionByUser);
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, getTransactionById);
router.put("/:id", authenticate, paymentLimiter, validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.patch("/:id/note", authenticate, validate(transactionSchema), auditLog("transactions"), updateTransactionNote);
router.delete("/:id", authenticate, paymentLimiter, auditLog("transactions"), deleteTransaction);
router.post("/:id/restore", authenticate, auditLog("transactions"), restoreTransaction);

// Payment operations
router.post("/payment", authenticate, paymentLimiter, validate(processPaymentSchema), auditLog("transactions"), processPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
