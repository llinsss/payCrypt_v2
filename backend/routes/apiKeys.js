import express from "express";
import {
  createApiKey,
  getApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyStats,
} from "../controllers/apiKeyController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { strictLimiter } from "../config/rateLimiting.js";
import Joi from "joi";

const router = express.Router();

// All API key management routes require authentication
router.use(authenticate);

// Validation schemas
const createApiKeySchema = Joi.object({
  name: Joi.string().required().min(3).max(100),
  scopes: Joi.string().optional().default("read,write"),
  ipWhitelist: Joi.string().optional(),
  expiresIn: Joi.number().optional().min(1).max(365), // days
});

const updateApiKeySchema = Joi.object({
  name: Joi.string().optional().min(3).max(100),
  scopes: Joi.string().optional(),
  ipWhitelist: Joi.string().optional(),
});

/**
 * @swagger
 * /api/api-keys:
 *   post:
 *     summary: Create a new API key
 *     description: |
 *       Generates a new API key for programmatic access.
 *       The full key is only shown once upon creation.
 *       Rate limited to 5 creations per hour.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Human-readable name for the API key
 *                 example: "Production App Key"
 *               scopes:
 *                 type: string
 *                 description: Comma-separated list of permissions
 *                 default: "read,write"
 *                 example: "read,write"
 *               ipWhitelist:
 *                 type: string
 *                 description: Comma-separated IP addresses allowed to use this key
 *                 example: "192.168.1.1,10.0.0.1"
 *               expiresIn:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *                 description: Expiry in days
 *                 example: 90
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 apiKey:
 *                   type: string
 *                   description: Full API key (shown only once)
 *                   example: "tp_live_abc123def456..."
 *                 data:
 *                   $ref: '#/components/schemas/ApiKey'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/", strictLimiter, validate(createApiKeySchema), createApiKey);

/**
 * @swagger
 * /api/api-keys:
 *   get:
 *     summary: List all API keys
 *     description: Retrieves all API keys for the authenticated user. Key values are masked.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", getApiKeys);

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   get:
 *     summary: Get API key details
 *     description: Retrieves details and usage statistics for a specific API key.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: API key ID
 *         example: 1
 *     responses:
 *       200:
 *         description: API key details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:keyId", getApiKey);

/**
 * @swagger
 * /api/api-keys/{keyId}/stats:
 *   get:
 *     summary: Get API key usage statistics
 *     description: Retrieves usage statistics and analytics for a specific API key.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: API key ID
 *         example: 1
 *     responses:
 *       200:
 *         description: API key usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_requests:
 *                   type: integer
 *                   example: 1500
 *                 last_used_at:
 *                   type: string
 *                   format: date-time
 *                 requests_today:
 *                   type: integer
 *                   example: 42
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:keyId/stats", getApiKeyStats);

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   patch:
 *     summary: Update an API key
 *     description: Updates the name, scopes, or IP whitelist for an existing API key.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: API key ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Updated Key Name"
 *               scopes:
 *                 type: string
 *                 example: "read"
 *               ipWhitelist:
 *                 type: string
 *                 example: "192.168.1.1"
 *     responses:
 *       200:
 *         description: API key updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch("/:keyId", validate(updateApiKeySchema), updateApiKey);

/**
 * @swagger
 * /api/api-keys/{keyId}/rotate:
 *   post:
 *     summary: Rotate an API key
 *     description: |
 *       Creates a new API key and revokes the old one.
 *       The new full key is only shown once.
 *       Rate limited to 5 rotations per hour.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: API key ID to rotate
 *         example: 1
 *     responses:
 *       200:
 *         description: API key rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 newApiKey:
 *                   type: string
 *                   description: New full API key (shown only once)
 *                   example: "tp_live_xyz789..."
 *                 data:
 *                   $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/:keyId/rotate", strictLimiter, rotateApiKey);

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Permanently revokes and deletes an API key. This action cannot be undone.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: API key ID to revoke
 *         example: 1
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "API key revoked successfully"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:keyId", revokeApiKey);

export default router;
