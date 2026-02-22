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
import { authenticate, userRateLimiter } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

router.get("/search", authenticate, userRateLimiter, searchTransactions);
router.get("/", authenticate, userRateLimiter, getTransactionByUser);
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, userRateLimiter, getTransactionById);
router.put("/:id", authenticate, userRateLimiter, paymentLimiter, validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.delete("/:id", authenticate, userRateLimiter, paymentLimiter, auditLog("transactions"), deleteTransaction);

// Payment operations
router.post("/payment", authenticate, userRateLimiter, paymentLimiter, validate(processPaymentSchema), auditLog("transactions"), processPayment);
router.get("/payment/limits", getPaymentLimits);

/**
 * @swagger
 * /api/transactions/tag/{tag}/history:
 *   get:
 *     summary: Get payment history by tag
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment history
 */
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
