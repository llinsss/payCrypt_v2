import express from "express";
import {
    createBatchPayment,
    getBatchPaymentStatus,
} from "../controllers/batchPaymentController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { batchPaymentSchema } from "../schemas/payment.js";
import { paymentLimiter } from "../config/rateLimiting.js";
import { idempotency } from "../middleware/idempotency.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Batch Payments
 *   description: Batch payment processing for multiple recipients at once
 */

/**
 * @swagger
 * /api/batches:
 *   post:
 *     summary: Create a batch payment
 *     description: Send payments to multiple recipients in a single atomic or non-atomic batch. Max 100 payments per batch.
 *     tags: [Batch Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - senderTag
 *               - payments
 *             properties:
 *               senderTag:
 *                 type: string
 *                 example: "alice"
 *                 description: Sender's @tag (3-20 alphanumeric/underscore)
 *               payments:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required:
 *                     - recipientTag
 *                     - amount
 *                   properties:
 *                     recipientTag:
 *                       type: string
 *                       example: "bob"
 *                     amount:
 *                       type: number
 *                       example: 5.0
 *                     notes:
 *                       type: string
 *                       example: "Monthly salary"
 *               atomic:
 *                 type: boolean
 *                 default: true
 *                 description: If true, the entire batch succeeds or fails together
 *               asset:
 *                 type: string
 *                 default: XLM
 *                 example: "USDC"
 *               assetIssuer:
 *                 type: string
 *                 description: Stellar asset issuer (required for custom assets)
 *               memo:
 *                 type: string
 *                 maxLength: 28
 *     responses:
 *       201:
 *         description: Batch payment created and queued
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
 *                     batchId:
 *                       type: string
 *                       example: "batch_abc123"
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     totalPayments:
 *                       type: integer
 *                       example: 3
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
    "/",
    authenticate,
    paymentLimiter,
    idempotency,
    validate(batchPaymentSchema),
    auditLog("batches"),
    createBatchPayment
);

/**
 * @swagger
 * /api/batches/{id}:
 *   get:
 *     summary: Get batch payment status
 *     description: Check the processing status and results of a batch payment.
 *     tags: [Batch Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch payment ID
 *     responses:
 *       200:
 *         description: Batch payment status
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
 *                     batchId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, processing, completed, partially_completed, failed]
 *                     completedPayments:
 *                       type: integer
 *                     failedPayments:
 *                       type: integer
 *                     totalPayments:
 *                       type: integer
 *       404:
 *         description: Batch payment not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, getBatchPaymentStatus);

export default router;
