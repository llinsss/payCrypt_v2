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
  searchTransactions,
} from "../controllers/transactionController.js";
import {
  authenticateJwtOrApiKey,
  userRateLimiter,
} from "../middleware/auth.js";
import { requireApiKeyScope } from "../middleware/apiKeyAuth.js";
import { validate, validateQuery, validateParams } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import {
  transactionSchema,
  transactionQuerySchema,
  transactionIdParamSchema,
  transactionTagParamSchema,
} from "../schemas/transaction.js";
import { processPaymentSchema, batchPaymentSchema } from "../schemas/payment.js";
import { rateLimit } from "../middleware/rateLimiter.js";
import { privateNoStore } from "../middleware/cacheControl.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Transaction history, payment processing, and receipt management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Transaction:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 42
 *         user_id:
 *           type: string
 *         type:
 *           type: string
 *           enum: [credit, debit, payment, swap]
 *           example: "payment"
 *         status:
 *           type: string
 *           enum: [pending, completed, failed]
 *           example: "completed"
 *         amount:
 *           type: number
 *           example: 50.0
 *         usd_value:
 *           type: number
 *           example: 50.0
 *         chain:
 *           type: string
 *           example: "stellar"
 *         token:
 *           type: string
 *           example: "USDC"
 *         sender_tag:
 *           type: string
 *           example: "alice"
 *         receiver_tag:
 *           type: string
 *           example: "bob"
 *         tx_hash:
 *           type: string
 *           example: "0xabc123..."
 *         note:
 *           type: string
 *           example: "Monthly rent"
 *         created_at:
 *           type: string
 *           format: date-time
 *     ProcessPaymentRequest:
 *       type: object
 *       required:
 *         - senderTag
 *         - recipientTag
 *         - amount
 *       properties:
 *         senderTag:
 *           type: string
 *           pattern: "^[a-zA-Z0-9_]{3,20}$"
 *           example: "alice"
 *         recipientTag:
 *           type: string
 *           pattern: "^[a-zA-Z0-9_]{3,20}$"
 *           example: "bob"
 *         amount:
 *           type: number
 *           example: 25.0
 *         asset:
 *           type: string
 *           default: XLM
 *           example: "USDC"
 *         assetIssuer:
 *           type: string
 *           description: Stellar asset issuer (required for non-native assets)
 *         memo:
 *           type: string
 *           maxLength: 28
 *           example: "Lunch money"
 *         notes:
 *           type: string
 *           maxLength: 500
 *         idempotencyKey:
 *           type: string
 *           maxLength: 255
 */

/**
 * @swagger
 * /api/transactions/search:
 *   get:
 *     summary: Search transactions with full-text and filters
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, pending, failed]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [credit, debit, payment, swap]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 */
router.get("/search", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), requireApiKeyScope(["transactions:read"]), searchTransactions);

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get user's transaction history
 *     description: Returns paginated transaction history for the authenticated user. Supports `transactions:read` scope for API keys.
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), requireApiKeyScope(["transactions:read"]), getTransactionByUser);

/**
 * @swagger
 * /api/transactions/tag/{tag}:
 *   get:
 *     summary: Get transactions associated with a @tag
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: Tag name to query transactions for
 *     responses:
 *       200:
 *         description: Transactions for the tag
 *       401:
 *         description: Unauthorized
 */
router.get("/tag/:tag", authenticateJwtOrApiKey, userRateLimiter, validateParams(transactionTagParamSchema), validateQuery(transactionQuerySchema), requireApiKeyScope(["transactions:read"]), getTransactionsByTag);

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get a specific transaction by ID
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       404:
 *         description: Transaction not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), validateParams(transactionIdParamSchema), requireApiKeyScope(["transactions:read"]), getTransactionById);

/**
 * @swagger
 * /api/transactions/{id}:
 *   put:
 *     summary: Update a transaction (e.g., add a note)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Transaction'
 *     responses:
 *       200:
 *         description: Transaction updated
 *       404:
 *         description: Transaction not found
 *   delete:
 *     summary: Soft-delete a transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaction deleted
 *       404:
 *         description: Transaction not found
 */
router.put("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), validate(transactionSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write"]), updateTransaction);
router.delete("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write"]), deleteTransaction);

/**
 * @swagger
 * /api/transactions/payment:
 *   post:
 *     summary: Process a @tag payment
 *     description: Send a payment from one @tag to another. Supports XLM and custom Stellar assets. Requires `transactions:write` or `payments:send` scope.
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessPaymentRequest'
 *     responses:
 *       200:
 *         description: Payment processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction_id:
 *                       type: integer
 *                       example: 42
 *                     tx_hash:
 *                       type: string
 *                       example: "0xabc123..."
 *                     status:
 *                       type: string
 *                       example: "completed"
 *       400:
 *         description: Validation error
 *       422:
 *         description: Insufficient balance or transfer failed
 *       401:
 *         description: Unauthorized
 */
router.post("/payment", authenticateJwtOrApiKey, rateLimit({ endpointName: "transactions" }), validate(processPaymentSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write", "payments:send"]), processPayment);

/**
 * @swagger
 * /api/transactions/payment/limits:
 *   get:
 *     summary: Get payment limits
 *     description: Returns the minimum and maximum payment amounts, fee percentages, and other limit configurations.
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Payment limits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 maxAmount:
 *                   type: number
 *                   example: 1000000
 *                 minAmount:
 *                   type: number
 *                   example: 1
 *                 baseFeePercentage:
 *                   type: number
 *                   example: 0.5
 *                 minFee:
 *                   type: number
 *                   example: 50
 */
router.get("/payment/limits", getPaymentLimits);

/**
 * @swagger
 * /api/transactions/tag/{tag}/history:
 *   get:
 *     summary: Get payment history for a @tag
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment history
 *       401:
 *         description: Unauthorized
 */
router.get("/tag/:tag/history", authenticateJwtOrApiKey, userRateLimiter, requireApiKeyScope(["transactions:read"]), getPaymentHistory);

/**
 * @swagger
 * /api/transactions/escrow/create:
 *   post:
 *     summary: Create a dispute-protected escrow for a payment
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientTag
 *               - amount
 *               - token
 *               - lockPeriodDays
 *               - senderTag
 *             properties:
 *               recipientTag:
 *                 type: string
 *                 example: "bob"
 *               amount:
 *                 type: number
 *                 example: 100
 *               token:
 *                 type: string
 *                 example: "USDC"
 *               lockPeriodDays:
 *                 type: integer
 *                 example: 3
 *               senderTag:
 *                 type: string
 *                 example: "alice"
 *     responses:
 *       201:
 *         description: Escrow created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
// Escrow endpoints would be added here with proper controller imports
// router.post("/escrow/create", authenticateJwtOrApiKey, createEscrow);

export default router;
