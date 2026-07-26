import express from "express";
import {
  getEventTypes,
  registerWebhook,
  getUserWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  getDeliveryHistory,
  verifySignature,
} from "../controllers/webhookController.js";
import { authenticateJwtOrApiKey } from "../middleware/auth.js";
import { requireApiKeyScope } from "../middleware/apiKeyAuth.js";
import { validateRegister, validateUpdate } from "../middleware/validateWebhook.js";

const router = express.Router();

// Cap payload size for all webhook routes
router.use(express.json({ limit: "16kb" }));

// Public utility
/**
 * @swagger
 * /api/webhooks/events:
 *   get:
 *     summary: Get Webhooks /events
 *     tags: [Webhooks]
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

router.get("/events", getEventTypes);
/**
 * @swagger
 * /api/webhooks/verify:
 *   post:
 *     summary: Post Webhooks /verify
 *     tags: [Webhooks]
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

router.post("/verify", verifySignature);

// Protected routes - JWT or API key with webhooks scope
router.use(authenticateJwtOrApiKey);

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Post Webhooks /
 *     tags: [Webhooks]
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
/**
 * @swagger
 * /api/webhooks/{id}:
 *   get:
 *     summary: Get Webhooks /:id
 *     tags: [Webhooks]
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
/**
 * @swagger
 * /api/webhooks/{id}/rotate-secret:
 *   post:
 *     summary: Post Webhooks /:id/rotate-secret
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
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
/**
 * @swagger
 * /api/webhooks/{id}/deliveries:
 *   get:
 *     summary: Get Webhooks /:id/deliveries
 *     tags: [Webhooks]
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
router.post("/", validateRegister, requireApiKeyScope(["webhooks:write"]), registerWebhook);
router.get("/", requireApiKeyScope(["webhooks:read"]), getUserWebhooks);
router.get("/:id", requireApiKeyScope(["webhooks:read"]), getWebhookById);
router.put("/:id", validateUpdate, requireApiKeyScope(["webhooks:write"]), updateWebhook);
router.delete("/:id", requireApiKeyScope(["webhooks:write"]), deleteWebhook);
router.post("/:id/rotate-secret", requireApiKeyScope(["webhooks:write"]), rotateSecret);
router.get("/:id/deliveries", requireApiKeyScope(["webhooks:read"]), getDeliveryHistory);

export default router;
