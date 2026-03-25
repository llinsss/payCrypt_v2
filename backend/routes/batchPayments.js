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

router.get("/:id", authenticate, getBatchPaymentStatus);

export default router;
