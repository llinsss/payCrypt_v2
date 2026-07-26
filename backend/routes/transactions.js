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
} from "../schemas/transaction.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { rateLimit } from "../middleware/rateLimiter.js";
import { privateNoStore } from "../middleware/cacheControl.js";

const router = express.Router();

/**
 * @swagger
 * /api/transactions/search:
 *   get:
 *     summary: Get Transactions /search
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get Transactions /
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/export/download:
 *   get:
 *     summary: Get Transactions /export/download
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/export:
 *   get:
 *     summary: Get Transactions /export
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/tag/{tag}:
 *   get:
 *     summary: Get Transactions /tag/:tag
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
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get Transactions /:id
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
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/payment:
 *   post:
 *     summary: Post Transactions /payment
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/batches:
 *   post:
 *     summary: Post Transactions /batches
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/payment/limits:
 *   get:
 *     summary: Get Transactions /payment/limits
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/transactions/tag/{tag}/history:
 *   get:
 *     summary: Get Transactions /tag/:tag/history
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
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// Read-only routes - requires transactions:read scope for API keys (JWT users bypass scope check)
router.get("/search", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), requireApiKeyScope(["transactions:read"]), searchTransactions);
router.get("/", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), requireApiKeyScope(["transactions:read"]), getTransactionByUser);
router.get("/export/download", rateLimit({ endpointName: "download", windowMs: 15 * 60 * 1000, max: 10 }), downloadExport);
router.get("/export", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "export", windowMs: 60 * 60 * 1000, max: 5 }), requireApiKeyScope(["transactions:read"]), exportTransactions);
router.get("/tag/:tag", authenticateJwtOrApiKey, userRateLimiter, validateParams(transactionTagParamSchema), validateQuery(transactionQuerySchema), requireApiKeyScope(["transactions:read"]), getTransactionsByTag);
router.get("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), validateParams(transactionIdParamSchema), requireApiKeyScope(["transactions:read"]), getTransactionById);

// Write routes - requires transactions:write scope for API keys (JWT users bypass scope check)
router.put("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), validate(transactionSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write"]), updateTransaction);
router.delete("/:id", authenticateJwtOrApiKey, rateLimit({ endpointName: "api" }), rateLimit({ endpointName: "transactions" }), validateParams(transactionIdParamSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write"]), deleteTransaction);

// Payment operations - requires transactions:write or payments:send scope
router.post("/payment", authenticateJwtOrApiKey, rateLimit({ endpointName: "transactions" }), validate(processPaymentSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write", "payments:send"]), processPayment);
router.post("/batches", authenticateJwtOrApiKey, rateLimit({ endpointName: "transactions" }), validate(batchPaymentSchema), auditLog("transactions"), requireApiKeyScope(["transactions:write", "payments:send"]), createBatchPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/tag/:tag/history", authenticateJwtOrApiKey, userRateLimiter, requireApiKeyScope(["transactions:read"]), getPaymentHistory);

export default router;
