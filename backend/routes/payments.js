import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  initiatePayment,
  verifyPayment,
  getPaymentStatus,
  getTransactionHistory,
  calculatePaymentFees,
  resolveTag,
  getPaymentLimits,
} from "../controllers/paymentController.js";

const router = express.Router();

/**
 * Payment Routes Documentation
 *
 * All routes except /resolve-tag and /calculator require authentication
 */

/**
 * POST /api/payments/initiate
 * Initiate a @tag-to-@tag payment
 * Body: { recipientTag, amount, asset?, memo? }
 * Response: { status, message, data }
 */
router.post("/initiate", authenticate, initiatePayment);

/**
 * POST /api/payments/verify
 * Verify payment details before processing (dry-run)
 * Body: { recipientTag, amount, asset?, memo? }
 * Response: { status, message, data }
 */
router.post("/verify", authenticate, verifyPayment);

/**
 * GET /api/payments/transaction/:reference
 * Get payment status by transaction reference
 * Params: reference (PAY-xxx format)
 * Response: { status, data }
 */
router.get("/transaction/:reference", authenticate, getPaymentStatus);

/**
 * GET /api/payments/history
 * Get transaction history for authenticated user
 * Query: { limit?, offset?, type?, status? }
 * Response: { status, data, pagination }
 */
router.get("/history", authenticate, getTransactionHistory);

/**
 * GET /api/payments/calculator
 * Calculate fees for a proposed payment (no processing)
 * Query: { amount, asset? }
 * Response: { status, data }
 */
router.get("/calculator", calculatePaymentFees);

/**
 * POST /api/payments/resolve-tag
 * Resolve a @tag to get recipient details (info only)
 * Body: { tag }
 * Response: { status, data }
 */
router.post("/resolve-tag", resolveTag);

/**
 * GET /api/payments/limits
 * Get payment limits for authenticated user
 * Response: { status, data }
 */
router.get("/limits", authenticate, getPaymentLimits);

export default router;
