import express from "express";
import {
    createDispute,
    getDisputes,
    getDisputeById,
    updateDisputeStatus,
} from "../controllers/disputeController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import {
    createDisputeSchema,
    disputeQuerySchema,
    updateDisputeStatusSchema,
} from "../schemas/dispute.js";
// Assuming you standard rate limiter is applied app wide or via custom limiter
// import { apiLimiter } from "../config/rateLimiting.js";

const router = express.Router();

// Create a new dispute
router.post(
    "/",
    authenticate,
    validate(createDisputeSchema),
    createDispute
);

// Get user disputes (or all if admin - controller handles the logic)
router.get(
    "/",
    authenticate,
    validateQuery(disputeQuerySchema),
    getDisputes
);

// Get a specific dispute
router.get("/:id", authenticate, getDisputeById);

// Update dispute status (Admin only or elevated privileges)
router.patch(
    "/:id/status",
    authenticate,
    validate(updateDisputeStatusSchema),
    updateDisputeStatus
);

export default router;
