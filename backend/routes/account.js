/**
 * Account routes — NDPR/GDPR privacy compliance endpoints.
 *
 * Issue #460: Expose user-facing data portability and account deletion
 * endpoints required by Nigeria's NDPR.
 *
 * Routes
 * ------
 * POST   /api/account/data-export             — Request a full data export
 * GET    /api/account/data-export/download    — Download prepared export (token-gated)
 * DELETE /api/account                         — Initiate account deletion (30-day grace)
 * POST   /api/account/cancel-deletion         — Cancel pending deletion (token-gated)
 */

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { auditLog } from "../middleware/audit.js";
import { rateLimit } from "../middleware/rateLimiter.js";
import {
  requestDataExport,
  downloadDataExport,
  deleteAccount,
  cancelDeletion,
} from "../controllers/accountController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Account
 *   description: NDPR/GDPR privacy compliance — data export and account deletion
 */

/**
 * @swagger
 * /api/account/data-export:
 *   post:
 *     summary: Request a personal data export (NDPR right to data portability)
 *     tags: [Account]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Export queued — download link sent by email within 24 hours
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  "/data-export",
  authenticate,
  // Limit to 3 export requests per day per user to prevent abuse.
  rateLimit({ endpointName: "data-export", windowMs: 24 * 60 * 60 * 1000, max: 3 }),
  auditLog("account"),
  requestDataExport,
);

/**
 * @swagger
 * /api/account/data-export/download:
 *   get:
 *     summary: Download a prepared personal data export (token-gated, one-time use)
 *     tags: [Account]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Signed download token received via email
 *     responses:
 *       200:
 *         description: JSON archive of all personal data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Missing or invalid token
 *       410:
 *         description: Token expired or already used
 */
router.get("/data-export/download", downloadDataExport);

/**
 * @swagger
 * /api/account:
 *   delete:
 *     summary: Initiate account deletion with 30-day grace period (NDPR right to erasure)
 *     tags: [Account]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deletion initiated — PII anonymised, cancellation email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 scheduledDeletionAt:
 *                   type: string
 *                   format: date-time
 *                 gracePeriodDays:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Deletion already pending
 */
router.delete(
  "/",
  authenticate,
  // Single deletion attempt per hour — prevents accidental repeated calls.
  rateLimit({ endpointName: "account-delete", windowMs: 60 * 60 * 1000, max: 5 }),
  auditLog("account"),
  deleteAccount,
);

/**
 * @swagger
 * /api/account/cancel-deletion:
 *   post:
 *     summary: Cancel a pending account deletion within the 30-day grace period
 *     tags: [Account]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Cancellation token received in the deletion confirmation email
 *     responses:
 *       200:
 *         description: Deletion cancelled — account is active again
 *       400:
 *         description: Missing token
 *       404:
 *         description: No matching pending deletion
 *       410:
 *         description: Grace period expired
 */
router.post("/cancel-deletion", cancelDeletion);

export default router;
