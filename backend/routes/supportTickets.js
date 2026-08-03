import express from "express";
import {
  createSupportTicket,
  getSupportTickets,
  getSupportTicketById,
  updateSupportTicketStatus,
} from "../controllers/supportTicketController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All support-ticket routes require authentication.

/**
 * @swagger
 * /support-tickets:
 *   post:
 *     summary: Submit a new support ticket
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, description, issue_type]
 *             properties:
 *               subject:
 *                 type: string
 *                 minLength: 5
 *                 example: "Transaction stuck for 2 hours"
 *               description:
 *                 type: string
 *                 minLength: 20
 *                 example: "I sent 0.5 ETH but the transaction has been pending..."
 *               issue_type:
 *                 type: string
 *                 enum: [failed_transaction, kyc_verification, deposit_issue, withdrawal_issue, account_access, other]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *               transaction_id:
 *                 type: string
 *                 nullable: true
 *                 example: "12345"
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, createSupportTicket);

/**
 * @swagger
 * /support-tickets:
 *   get:
 *     summary: List support tickets for the authenticated user
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list of tickets
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, getSupportTickets);

/**
 * @swagger
 * /support-tickets/{id}:
 *   get:
 *     summary: Get a single support ticket
 *     tags: [SupportTickets]
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
 *         description: Ticket details
 *       404:
 *         description: Ticket not found
 */
router.get("/:id", authenticate, getSupportTicketById);

/**
 * @swagger
 * /support-tickets/{id}/status:
 *   patch:
 *     summary: Update the status of a support ticket
 *     tags: [SupportTickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, resolved, closed]
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Ticket not found
 */
router.patch("/:id/status", authenticate, updateSupportTicketStatus);

export default router;
