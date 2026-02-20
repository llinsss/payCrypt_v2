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
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Transaction and payment management
 */

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get transactions by user
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of transactions
 */
router.get("/", authenticate, getTransactionByUser);

/**
 * @swagger
 * /api/transactions/tag/{tag}:
 *   get:
 *     summary: Get transactions by tag
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of transactions based on tag
 */
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get transaction by ID
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction details
 *   put:
 *     summary: Update transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction updated
 *   delete:
 *     summary: Delete transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction deleted
 */
router.get("/:id", authenticate, getTransactionById);
router.put("/:id", authenticate, paymentLimiter, validate(transactionSchema), auditLog("transactions"), updateTransaction);
router.delete("/:id", authenticate, paymentLimiter, auditLog("transactions"), deleteTransaction);

// Payment operations
/**
 * @swagger
 * /api/transactions/payment:
 *   post:
 *     summary: Process a payment
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment processed successfully
 */
router.post("/payment", authenticate, paymentLimiter, validate(processPaymentSchema), auditLog("transactions"), processPayment);

/**
 * @swagger
 * /api/transactions/payment/limits:
 *   get:
 *     summary: Get payment limits
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Payment limits
 */
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
