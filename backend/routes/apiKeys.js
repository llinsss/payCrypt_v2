import express from "express";
import {
  createApiKey,
  getApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyStats,
  getApiKeyAuditLogs,
} from "../controllers/apiKeyController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
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
  rotationIntervalDays: Joi.number().optional().min(1).max(365), // days
});

const updateApiKeySchema = Joi.object({
  name: Joi.string().optional().min(3).max(100),
  scopes: Joi.string().optional(),
  ipWhitelist: Joi.string().optional(),
  rotationIntervalDays: Joi.number().optional().min(0).max(365), // 0 to disable
});

/**
 * @swagger
 * tags:
 *   name: API Keys
 *   description: API key management for third-party integrations
 */

/**
 * @swagger
 * /api/api-keys:
 *   post:
 *     summary: Create a new API key
 *     description: Generate an API key with specified scopes for third-party access. The key is returned only once — store it securely.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
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
 *                 example: "Partner Integration Key"
 *               scopes:
 *                 type: string
 *                 default: "read,write"
 *                 description: Comma-separated scopes (transactions:read, transactions:write, payments:send, webhooks:read, webhooks:write)
 *                 example: "transactions:read,webhooks:read"
 *               ipWhitelist:
 *                 type: string
 *                 description: Comma-separated IP addresses or CIDR ranges
 *                 example: "203.0.113.0/24,192.168.1.1"
 *               expiresIn:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 365
 *                 description: Number of days until the key expires
 *                 example: 90
 *               rotationIntervalDays:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 365
 *                 description: Automatic rotation interval in days
 *                 example: 30
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Partner Integration Key"
 *                     key:
 *                       type: string
 *                       example: "tagged_live_sk_a1b2c3d4e5f6..."
 *                     scopes:
 *                       type: string
 *                       example: "transactions:read,webhooks:read"
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/", strictLimiter, validate(createApiKeySchema), auditLog("api_keys"), createApiKey);

/**
 * @swagger
 * /api/api-keys:
 *   get:
 *     summary: List all API keys for the authenticated user
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       scopes:
 *                         type: string
 *                       is_active:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get("/", getApiKeys);

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   get:
 *     summary: Get a specific API key by ID
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key details
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
 *                     name:
 *                       type: string
 *                     scopes:
 *                       type: string
 *                     is_active:
 *                       type: boolean
 *                     last_used_at:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: API key not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:keyId", getApiKey);

/**
 * @swagger
 * /api/api-keys/{keyId}/stats:
 *   get:
 *     summary: Get usage statistics for an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key usage statistics
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
 *                     total_requests:
 *                       type: integer
 *                     last_used_at:
 *                       type: string
 *                       format: date-time
 *                     requests_by_scope:
 *                       type: object
 *       404:
 *         description: API key not found
 */
router.get("/:keyId/stats", getApiKeyStats);

/**
 * @swagger
 * /api/api-keys/{keyId}/rotation-logs:
 *   get:
 *     summary: Get rotation logs for an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rotation audit logs
 *       404:
 *         description: API key not found
 */
router.get("/:keyId/rotation-logs", getApiKeyAuditLogs);

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   patch:
 *     summary: Update an API key
 *     description: Update the name, scopes, IP whitelist, or rotation interval of an existing API key.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
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
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *               scopes:
 *                 type: string
 *               ipWhitelist:
 *                 type: string
 *               rotationIntervalDays:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 365
 *     responses:
 *       200:
 *         description: API key updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: API key not found
 */
router.patch("/:keyId", validate(updateApiKeySchema), auditLog("api_keys"), updateApiKey);

/**
 * @swagger
 * /api/api-keys/{keyId}/rotate:
 *   post:
 *     summary: Rotate an API key
 *     description: Creates a new key and revokes the old one. The new key is returned only once.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Key rotated successfully — new key returned
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
 *                     new_key:
 *                       type: string
 *                     old_key_revoked_at:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: API key not found
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/:keyId/rotate", strictLimiter, auditLog("api_keys"), rotateApiKey);

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Permanently revoke an API key. All requests using this key will be rejected.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *       404:
 *         description: API key not found
 */
router.delete("/:keyId", auditLog("api_keys"), revokeApiKey);

export default router;
