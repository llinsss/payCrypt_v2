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

// Batch Payment Routes
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
 * /api/batchPayments/{id}:
 *   get:
 *     summary: Get Batchpayments /:id
 *     tags: [Batchpayments]
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

router.get("/:id", authenticate, getBatchPaymentStatus);

export default router;
