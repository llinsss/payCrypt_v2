import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { getDeadLetters, retryDeadLetter } from "../controllers/webhookAdminController.js";

const router = express.Router();

/**
 * Webhook Administration Endpoints
 * Protected by global admin middleware blocks assuring standard security posture.
 */

// View DLQ list
/**
 * @swagger
 * /api/webhookAdmin/dlq:
 *   get:
 *     summary: Get Webhookadmin /dlq
 *     tags: [Webhookadmin]
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

router.get("/dlq", authenticate, requireAdmin, getDeadLetters);

// Retry a specific DLQ event manually
/**
 * @swagger
 * /api/webhookAdmin/dlq/{event_id}/retry:
 *   post:
 *     summary: Post Webhookadmin /dlq/:event_id/retry
 *     tags: [Webhookadmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: event_id
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

router.post("/dlq/:event_id/retry", authenticate, requireAdmin, retryDeadLetter);

export default router;
