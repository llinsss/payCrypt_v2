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

// ─── Admin Statistics (place before /:id to avoid route collision) ───
/**
 * @swagger
 * /api/disputes/statistics:
 *   get:
 *     summary: Get Disputes /statistics
 *     tags: [Disputes]
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

router.get("/statistics", authenticate, getDisputeStatistics);

// ─── Create a new dispute ───────────────────────────────
router.post(
    "/",
    authenticate,
    validate(createDisputeSchema),
    createDispute
);

// ─── List disputes (user sees own, admin sees all) ──────
router.get(
    "/",
    authenticate,
    validateQuery(disputeQuerySchema),
    getDisputes
);

// ─── Get a specific dispute ─────────────────────────────
/**
 * @swagger
 * /api/disputes/{id}:
 *   get:
 *     summary: Get Disputes /:id
 *     tags: [Disputes]
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

router.get("/:id", authenticate, getDisputeById);

// ─── Update dispute status (Admin only) ─────────────────
router.patch(
    "/:id/status",
    authenticate,
    validate(updateDisputeStatusSchema),
    updateDisputeStatus
);

// ─── Escalate a dispute ─────────────────────────────────
router.post(
    "/:id/escalate",
    authenticate,
    validate(escalateDisputeSchema),
    escalateDispute
);

// ─── Assign dispute to admin ────────────────────────────
router.patch(
    "/:id/assign",
    authenticate,
    validate(assignDisputeSchema),
    assignDispute
);

// ─── Dispute comments ───────────────────────────────────
router.post(
    "/:id/comments",
    authenticate,
    validate(addCommentSchema),
    addDisputeComment
);

/**
 * @swagger
 * /api/disputes/{id}/comments:
 *   get:
 *     summary: Get Disputes /:id/comments
 *     tags: [Disputes]
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

router.get("/:id/comments", authenticate, getDisputeComments);

export default router;
