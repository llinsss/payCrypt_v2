import express from "express";
import {
    createScheduledPayment,
    getScheduledPayments,
    getScheduledPaymentById,
    cancelScheduledPayment,
    resumeScheduledPayment,
    getUpcomingPayments,
} from "../controllers/scheduledPaymentController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import {
    createScheduledPaymentSchema,
    scheduledPaymentQuerySchema,
} from "../schemas/scheduledPayment.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Scheduled Payments
 *   description: Schedule future payments (recurring or one-time)
 */

/**
 * @swagger
 * /api/scheduled-payments:
 *   post:
 *     summary: Create a scheduled payment
 *     description: Schedule a payment to be executed at a future date. The scheduled date must be within 30 days from now.
 *     tags: [Scheduled Payments]
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
 *               - scheduledAt
 *             properties:
 *               recipientTag:
 *                 type: string
 *                 pattern: "^[a-zA-Z0-9_]{3,20}$"
 *                 example: "bob"
 *                 description: Recipient's @tag
 *               amount:
 *                 type: number
 *                 example: 25.0
 *                 description: Amount to send
 *               asset:
 *                 type: string
 *                 default: XLM
 *                 example: "USDC"
 *                 description: Asset code (1-12 uppercase alphanumeric)
 *               assetIssuer:
 *                 type: string
 *                 description: Stellar asset issuer address (required for custom assets)
 *               memo:
 *                 type: string
 *                 maxLength: 28
 *                 example: "Monthly rent"
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-15T09:00:00Z"
 *                 description: ISO datetime when payment should execute (must be in the future, max 30 days)
 *     responses:
 *       201:
 *         description: Scheduled payment created
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
 *                       example: 1
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     scheduledAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error (e.g., scheduled date in past)
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 *   get:
 *     summary: List user's scheduled payments
 *     description: Returns all scheduled payments for the authenticated user, with optional status filtering.
 *     tags: [Scheduled Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: List of scheduled payments
 *       401:
 *         description: Unauthorized
 */
router.post(
    "/",
    authenticate,
    paymentLimiter,
    validate(createScheduledPaymentSchema),
    createScheduledPayment
);

router.get(
    "/",
    authenticate,
    validateQuery(scheduledPaymentQuerySchema),
    getScheduledPayments
);

/**
 * @swagger
 * /api/scheduled-payments/upcoming:
 *   get:
 *     summary: Get upcoming pending scheduled payments
 *     description: Returns scheduled payments that are due to execute soon.
 *     tags: [Scheduled Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upcoming scheduled payments
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
 *       401:
 *         description: Unauthorized
 */
router.get("/upcoming", authenticate, getUpcomingPayments);

/**
 * @swagger
 * /api/scheduled-payments/{id}:
 *   get:
 *     summary: Get a specific scheduled payment
 *     tags: [Scheduled Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Scheduled payment ID
 *     responses:
 *       200:
 *         description: Scheduled payment details
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
 *                     recipientTag:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     status:
 *                       type: string
 *                     scheduledAt:
 *                       type: string
 *       404:
 *         description: Scheduled payment not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, getScheduledPaymentById);

/**
 * @swagger
 * /api/scheduled-payments/{id}/cancel:
 *   patch:
 *     summary: Cancel a scheduled payment
 *     description: Cancel a pending scheduled payment. Only payments with status "pending" can be cancelled.
 *     tags: [Scheduled Payments]
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
 *         description: Scheduled payment cancelled
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
 *                     status:
 *                       type: string
 *                       example: "cancelled"
 *       404:
 *         description: Scheduled payment not found
 *       400:
 *         description: Cannot cancel a payment that is not pending
 */
router.patch("/:id/cancel", authenticate, cancelScheduledPayment);

// Resume a paused scheduled payment
router.patch("/:id/resume", authenticate, resumeScheduledPayment);

export default router;
