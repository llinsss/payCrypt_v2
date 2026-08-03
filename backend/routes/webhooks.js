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

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Webhook registration, management, and event delivery tracking
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     WebhookEventType:
 *       type: string
 *       enum:
 *         - payment.completed
 *         - payment.failed
 *         - payment.pending
 *         - payment.refunded
 *         - wallet.credited
 *         - wallet.debited
 *         - kyc.approved
 *         - kyc.rejected
 *         - transaction.status_changed
 *     WebhookRegistration:
 *       type: object
 *       required:
 *         - url
 *         - events
 *       properties:
 *         url:
 *           type: string
 *           format: uri
 *           example: "https://yourapp.com/api/webhooks/tagged"
 *         events:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/WebhookEventType'
 *           example: ["payment.completed", "wallet.credited"]
 *         secret:
 *           type: string
 *           example: "whsec_abc123def456..."
 *           description: Optional custom signing secret. If omitted, one will be generated.
 *     WebhookDelivery:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         webhook_id:
 *           type: integer
 *         event_type:
 *           type: string
 *         payload:
 *           type: object
 *         status:
 *           type: string
 *           enum: [pending, delivered, failed]
 *         attempts:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *     WebhookEventPayload:
 *       type: object
 *       description: Payload delivered to webhook URL on each event
 *       properties:
 *         event:
 *           type: string
 *           example: "payment.completed"
 *         timestamp:
 *           type: string
 *           format: date-time
 *         data:
 *           type: object
 *           properties:
 *             transaction_id:
 *               type: integer
 *               example: 42
 *             user_id:
 *               type: string
 *             amount:
 *               type: number
 *               example: 50.0
 *             asset:
 *               type: string
 *               example: "USDC"
 *             status:
 *               type: string
 *               example: "completed"
 *         signature:
 *           type: string
 *           description: HMAC-SHA256 signature for verifying payload authenticity
 */

/**
 * @swagger
 * /api/webhooks/events:
 *   get:
 *     summary: List available webhook event types
 *     description: Public endpoint returning all event types that can be subscribed to via webhooks.
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: List of event types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WebhookEventType'
 */
router.get("/events", getEventTypes);

/**
 * @swagger
 * /api/webhooks/verify:
 *   post:
 *     summary: Verify a webhook payload signature
 *     description: Public utility endpoint to verify that a webhook payload was signed with the correct secret. Useful for debugging webhook integrations.
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payload
 *               - signature
 *               - secret
 *             properties:
 *               payload:
 *                 type: object
 *                 description: The webhook payload body to verify
 *               signature:
 *                 type: string
 *                 description: The HMAC-SHA256 signature received in the webhook header
 *               secret:
 *                 type: string
 *                 description: The webhook signing secret
 *     responses:
 *       200:
 *         description: Signature verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 valid:
 *                   type: boolean
 *                   example: true
 */
router.post("/verify", verifySignature);

// Protected routes - JWT or API key with webhooks scope
router.use(authenticateJwtOrApiKey);

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Register a new webhook
 *     description: Create a webhook subscription to receive event notifications at a specified URL. Requires `webhooks:write` scope for API key authentication.
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookRegistration'
 *     responses:
 *       201:
 *         description: Webhook registered successfully. The secret is returned only once.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Webhook registered. Store the secret — it will not be shown again."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     url:
 *                       type: string
 *                     events:
 *                       type: array
 *                       items:
 *                         type: string
 *                     secret:
 *                       type: string
 *       400:
 *         description: Validation error or invalid URL
 *   get:
 *     summary: List user's webhooks
 *     description: Returns all webhook subscriptions for the authenticated user. Requires `webhooks:read` scope for API keys.
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       url:
 *                         type: string
 *                       events:
 *                         type: array
 *                         items:
 *                           type: string
 *                       is_active:
 *                         type: boolean
 *       401:
 *         description: Unauthorized
 */
router.post("/", validateRegister, requireApiKeyScope(["webhooks:write"]), registerWebhook);
router.get("/", requireApiKeyScope(["webhooks:read"]), getUserWebhooks);

/**
 * @swagger
 * /api/webhooks/{id}:
 *   get:
 *     summary: Get a specific webhook by ID
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Webhook ID
 *     responses:
 *       200:
 *         description: Webhook details
 *       403:
 *         description: Forbidden — not the webhook owner
 *       404:
 *         description: Webhook not found
 *   put:
 *     summary: Update a webhook
 *     description: Update the URL, events, or active status of an existing webhook. Requires `webhooks:write` scope.
 *     tags: [Webhooks]
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
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/WebhookEventType'
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Webhook not found
 *   delete:
 *     summary: Delete a webhook
 *     description: Permanently remove a webhook subscription. Requires `webhooks:write` scope.
 *     tags: [Webhooks]
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
 *         description: Webhook deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Webhook not found
 */
router.get("/:id", requireApiKeyScope(["webhooks:read"]), getWebhookById);
router.put("/:id", validateUpdate, requireApiKeyScope(["webhooks:write"]), updateWebhook);
router.delete("/:id", requireApiKeyScope(["webhooks:write"]), deleteWebhook);

/**
 * @swagger
 * /api/webhooks/{id}/rotate-secret:
 *   post:
 *     summary: Rotate a webhook's signing secret
 *     description: Generate a new signing secret for a webhook. The old secret will no longer be valid. Requires `webhooks:write` scope.
 *     tags: [Webhooks]
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
 *         description: Secret rotated successfully. New secret returned only once.
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
 *                     new_secret:
 *                       type: string
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Webhook not found
 */
router.post("/:id/rotate-secret", requireApiKeyScope(["webhooks:write"]), rotateSecret);

/**
 * @swagger
 * /api/webhooks/{id}/deliveries:
 *   get:
 *     summary: Get webhook delivery history
 *     description: Returns the delivery history (status, attempts, timestamps) for a webhook. Requires `webhooks:read` scope.
 *     tags: [Webhooks]
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
 *         description: Delivery history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WebhookDelivery'
 *       404:
 *         description: Webhook not found
 */
router.get("/:id/deliveries", requireApiKeyScope(["webhooks:read"]), getDeliveryHistory);

export default router;
