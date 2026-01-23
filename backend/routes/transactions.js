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
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Create a new transaction record
 *     description: |
 *       Creates a new transaction record in the database.
 *       Note: This endpoint is for recording transactions, not for initiating transfers.
 *       Use wallet endpoints for actual fund transfers.
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TransactionRequest'
 *           example:
 *             type: "credit"
 *             amount: "100.00"
 *             status: "completed"
 *             token: "USDT"
 *             description: "Deposit from external wallet"
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
// Apply payment rate limiter: 100 per hour per API key/user
router.post("/", authenticate, paymentLimiter, validate(transactionSchema), createTransaction);

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get user's transaction history
 *     description: |
 *       Retrieves all transactions for the authenticated user.
 *       Transactions are ordered by creation date (newest first).
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transaction'
 *             example:
 *               - id: 1
 *                 user_id: 1
 *                 reference: "TXN_abc123xyz789"
 *                 type: "credit"
 *                 status: "completed"
 *                 amount: "100.00"
 *                 usd_value: "100.00"
 *                 tx_hash: "0xabc123..."
 *                 from_address: "johndoe"
 *                 to_address: "janedoe"
 *                 description: "Fund received"
 *                 created_at: "2024-01-15T10:30:00.000Z"
 *               - id: 2
 *                 user_id: 1
 *                 reference: "TXN_def456uvw012"
 *                 type: "debit"
 *                 status: "completed"
 *                 amount: "50.00"
 *                 usd_value: "50.00"
 *                 tx_hash: "0xdef456..."
 *                 from_address: "janedoe"
 *                 to_address: "bobsmith"
 *                 description: "Fund transfer"
 *                 created_at: "2024-01-14T15:20:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", authenticate, getTransactionByUser);

/**
 * @swagger
 * /api/transactions/tag/{tag}:
 *   get:
 *     summary: Get transactions by user tag
 *     description: Retrieves all transactions for a specific user tag (public endpoint)
 *     tags: [Transactions]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: User tag
 *         example: "johndoe"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of transactions for the tag
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transaction'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get transaction by ID
 *     description: Retrieves a specific transaction by its ID. Users can only view their own transactions.
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Transaction details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Transaction not found"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to view this transaction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Unauthorized"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", authenticate, getTransactionById);

/**
 * @swagger
 * /api/transactions/{id}:
 *   put:
 *     summary: Update a transaction
 *     description: Updates a transaction record. Users can only update their own transactions.
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TransactionRequest'
 *           example:
 *             status: "completed"
 *             description: "Updated description"
 *     responses:
 *       200:
 *         description: Transaction updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Transaction not found or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to update this transaction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", authenticate, paymentLimiter, validate(transactionSchema), updateTransaction);

/**
 * @swagger
 * /api/transactions/{id}:
 *   delete:
 *     summary: Delete a transaction
 *     description: Deletes a transaction record. Users can only delete their own transactions.
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Transaction deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Transaction deleted successfully"
 *       400:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to delete this transaction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", authenticate, paymentLimiter, deleteTransaction);

/**
 * @swagger
 * /api/transactions/payment:
 *   post:
 *     summary: Process a payment
 *     description: Initiates and processes a payment transaction
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TransactionRequest'
 *     responses:
 *       200:
 *         description: Payment processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/payment", authenticate, processPayment);

/**
 * @swagger
 * /api/transactions/payment/limits:
 *   get:
 *     summary: Get payment limits
 *     description: Retrieves the current payment limits and thresholds
 *     tags: [Transactions]
 *     security: []
 *     responses:
 *       200:
 *         description: Payment limits retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 min_amount:
 *                   type: number
 *                 max_amount:
 *                   type: number
 *                 daily_limit:
 *                   type: number
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/payment/limits", getPaymentLimits);

/**
 * @swagger
 * /api/transactions/tag/{tag}/history:
 *   get:
 *     summary: Get payment history by tag
 *     description: Retrieves the payment history for a specific user tag
 *     tags: [Transactions]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: User tag
 *         example: "johndoe"
 *     responses:
 *       200:
 *         description: Payment history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transaction'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
