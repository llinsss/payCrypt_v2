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
router.get("/upcoming", authenticate, getUpcomingPayments);

// Get a specific scheduled payment
router.get("/:id", authenticate, getScheduledPaymentById);

// Cancel a scheduled payment
router.patch("/:id/cancel", authenticate, cancelScheduledPayment);

export default router;
