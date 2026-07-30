import express from "express";
import * as withdrawalController from "../controllers/withdrawalController.js";
import { handlePaystackWebhook } from "../controllers/webhooks/paystackWebhook.js";
import { handleMonnifyWebhook } from "../controllers/webhooks/monnifyWebhook.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Withdrawals
 *   description: Bank withdrawal initiation and webhook callbacks
 */

/**
 * @swagger
 * /api/withdrawals/initiate:
 *   post:
 *     summary: Initiate a bank withdrawal
 *     description: Start a fiat withdrawal from crypto balance to a linked Nigerian bank account. Creates a withdrawal request that will be processed via Paystack or Monnify.
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - bankAccountId
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 50000
 *                 description: Amount in NGN to withdraw
 *               bankAccountId:
 *                 type: integer
 *                 example: 1
 *                 description: ID of the linked bank account to receive funds
 *               reference:
 *                 type: string
 *                 description: Optional custom reference for tracking
 *     responses:
 *       200:
 *         description: Withdrawal initiated
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
 *                     id:
 *                       type: integer
 *                     reference:
 *                       type: string
 *                       example: "WD_ref_abc123"
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     amount:
 *                       type: number
 *       400:
 *         description: Validation error or insufficient balance
 *       401:
 *         description: Unauthorized
 */
router.post("/initiate", withdrawalController.initiateWithdrawal);

/**
 * @swagger
 * /api/withdrawals/my:
 *   get:
 *     summary: Get user's withdrawal history
 *     description: List all withdrawal requests for the authenticated user.
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Withdrawal history
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       reference:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                         enum: [pending, processing, completed, failed]
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get("/my", withdrawalController.getMyWithdrawals);

/**
 * @swagger
 * /api/withdrawals/{id}:
 *   get:
 *     summary: Get withdrawal details by ID
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Withdrawal ID
 *     responses:
 *       200:
 *         description: Withdrawal details
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
 *                     id:
 *                       type: integer
 *                     reference:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     fee:
 *                       type: number
 *                     status:
 *                       type: string
 *                     provider:
 *                       type: string
 *                       example: "paystack"
 *                     bank_details:
 *                       type: object
 *                     created_at:
 *                       type: string
 *       404:
 *         description: Withdrawal not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", withdrawalController.getWithdrawalDetails);

/**
 * @swagger
 * /api/withdrawals/webhooks/paystack:
 *   post:
 *     summary: Paystack withdrawal webhook callback
 *     description: Webhook endpoint for Paystack to notify the platform about withdrawal status changes. This endpoint is public (no auth required) and validates the Paystack signature.
 *     tags: [Withdrawals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Paystack webhook event payload
 *             properties:
 *               event:
 *                 type: string
 *                 example: "transfer.success"
 *               data:
 *                 type: object
 *                 properties:
 *                   reference:
 *                     type: string
 *                   amount:
 *                     type: number
 *                   status:
 *                     type: string
 *     responses:
 *       200:
 *         description: Webhook processed
 */
router.post("/webhooks/paystack", handlePaystackWebhook);

/**
 * @swagger
 * /api/withdrawals/webhooks/monnify:
 *   post:
 *     summary: Monnify withdrawal webhook callback
 *     description: Webhook endpoint for Monnify to notify the platform about withdrawal status changes. This endpoint is public (no auth required) and validates the Monnify signature.
 *     tags: [Withdrawals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Monnify webhook event payload
 *     responses:
 *       200:
 *         description: Webhook processed
 */
router.post("/webhooks/monnify", handleMonnifyWebhook);

export default router;
