import express from "express";
import {
    createDispute,
    getDisputes,
    getDisputeById,
    updateDisputeStatus,
    escalateDispute,
    assignDispute,
    addDisputeComment,
    getDisputeComments,
    getDisputeStatistics,
} from "../controllers/disputeController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import {
    createDisputeSchema,
    disputeQuerySchema,
    updateDisputeStatusSchema,
    escalateDisputeSchema,
    addCommentSchema,
    assignDisputeSchema,
} from "../schemas/dispute.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Disputes
 *   description: Transaction dispute management and resolution
 */

/**
 * @swagger
 * /api/disputes/statistics:
 *   get:
 *     summary: Get dispute statistics
 *     description: Returns aggregate statistics on dispute counts, resolution times, and category breakdown.
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dispute statistics
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
 *                     total_disputes:
 *                       type: integer
 *                     open_disputes:
 *                       type: integer
 *                     resolved_disputes:
 *                       type: integer
 *                     avg_resolution_time_hours:
 *                       type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/statistics", authenticate, getDisputeStatistics);

/**
 * @swagger
 * /api/disputes:
 *   post:
 *     summary: Create a new dispute
 *     description: Open a dispute for a specific transaction. Requires the transaction ID, reason, and category.
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transaction_id
 *               - reason
 *               - description
 *               - category
 *             properties:
 *               transaction_id:
 *                 type: integer
 *                 example: 42
 *                 description: The transaction ID to dispute
 *               reason:
 *                 type: string
 *                 maxLength: 255
 *                 example: "Payment not received"
 *               description:
 *                 type: string
 *                 example: "I sent 50 USDC to @bob but the funds never arrived in their wallet"
 *               category:
 *                 type: string
 *                 enum: [unauthorized, duplicate, wrong_amount, not_received, fraud, other]
 *                 example: "not_received"
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 default: medium
 *               evidence_url:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/evidence.pdf"
 *     responses:
 *       201:
 *         description: Dispute created successfully
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
 *                       example: "open"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: List disputes
 *     description: Users see their own disputes; admins see all disputes. Supports filtering and pagination.
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, under_review, escalated, resolved, closed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [unauthorized, duplicate, wrong_amount, not_received, fraud, other]
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
 *         description: Paginated list of disputes
 *       401:
 *         description: Unauthorized
 */
router.post(
    "/",
    authenticate,
    validate(createDisputeSchema),
    createDispute
);

router.get(
    "/",
    authenticate,
    validateQuery(disputeQuerySchema),
    getDisputes
);

/**
 * @swagger
 * /api/disputes/{id}:
 *   get:
 *     summary: Get a specific dispute by ID
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Dispute ID
 *     responses:
 *       200:
 *         description: Dispute details
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
 *                     transaction_id:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     reason:
 *                       type: string
 *                     category:
 *                       type: string
 *                     priority:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Dispute not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, getDisputeById);

/**
 * @swagger
 * /api/disputes/{id}/status:
 *   patch:
 *     summary: Update dispute status (Admin only)
 *     description: Change the dispute status and optionally add a resolution note.
 *     tags: [Disputes]
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
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [under_review, escalated, resolved, closed]
 *                 example: "resolved"
 *               resolution_note:
 *                 type: string
 *                 example: "Payment was delayed due to network congestion; funds have now been delivered."
 *               assigned_admin_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Dispute status updated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Dispute not found
 */
router.patch(
    "/:id/status",
    authenticate,
    validate(updateDisputeStatusSchema),
    updateDisputeStatus
);

/**
 * @swagger
 * /api/disputes/{id}/escalate:
 *   post:
 *     summary: Escalate a dispute
 *     description: Escalate an open dispute to a higher priority level with a detailed reason.
 *     tags: [Disputes]
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
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *                 example: "The recipient has not responded in 48 hours and the funds appear stuck on-chain."
 *     responses:
 *       200:
 *         description: Dispute escalated
 *       404:
 *         description: Dispute not found
 */
router.post(
    "/:id/escalate",
    authenticate,
    validate(escalateDisputeSchema),
    escalateDispute
);

/**
 * @swagger
 * /api/disputes/{id}/assign:
 *   patch:
 *     summary: Assign a dispute to an admin
 *     description: Assign an open or under-review dispute to a specific admin for resolution.
 *     tags: [Disputes]
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
 *             required:
 *               - admin_id
 *             properties:
 *               admin_id:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       200:
 *         description: Dispute assigned
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Dispute not found
 */
router.patch(
    "/:id/assign",
    authenticate,
    validate(assignDisputeSchema),
    assignDispute
);

/**
 * @swagger
 * /api/disputes/{id}/comments:
 *   post:
 *     summary: Add a comment to a dispute
 *     tags: [Disputes]
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
 *             required:
 *               - comment
 *             properties:
 *               comment:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *                 example: "I've checked the on-chain transaction and the funds were indeed sent but haven't been credited."
 *     responses:
 *       201:
 *         description: Comment added
 *   get:
 *     summary: Get comments for a dispute
 *     tags: [Disputes]
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
 *         description: List of dispute comments
 *       404:
 *         description: Dispute not found
 */
router.post(
    "/:id/comments",
    authenticate,
    validate(addCommentSchema),
    addDisputeComment
);

router.get("/:id/comments", authenticate, getDisputeComments);

export default router;
