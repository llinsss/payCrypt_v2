import express from "express";
import {
    createScheduledPayment,
    getScheduledPayments,
    getScheduledPaymentById,
    cancelScheduledPayment,
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

// Create a new scheduled payment
router.post(
    "/",
    authenticate,
    paymentLimiter,
    validate(createScheduledPaymentSchema),
    createScheduledPayment
);

// List user's scheduled payments
router.get(
    "/",
    authenticate,
    validateQuery(scheduledPaymentQuerySchema),
    getScheduledPayments
);

// Get upcoming pending payments
/**
 * @swagger
 * /api/scheduledPayments/upcoming:
 *   get:
 *     summary: Get Scheduledpayments /upcoming
 *     tags: [Scheduledpayments]
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

router.get("/upcoming", authenticate, getUpcomingPayments);

// Get a specific scheduled payment
/**
 * @swagger
 * /api/scheduledPayments/{id}:
 *   get:
 *     summary: Get Scheduledpayments /:id
 *     tags: [Scheduledpayments]
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

router.get("/:id", authenticate, getScheduledPaymentById);

// Cancel a scheduled payment
/**
 * @swagger
 * /api/scheduledPayments/{id}/cancel:
 *   patch:
 *     summary: Patch Scheduledpayments /:id/cancel
 *     tags: [Scheduledpayments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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

router.patch("/:id/cancel", authenticate, cancelScheduledPayment);

export default router;
