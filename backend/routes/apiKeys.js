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

// Create new API key (strict rate limiting)
/**
 * @swagger
 * /api/apiKeys:
 *   post:
 *     summary: Post Apikeys /
 *     tags: [Apikeys]
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

router.post("/", strictLimiter, validate(createApiKeySchema), auditLog("api_keys"), createApiKey);

// Get all API keys
/**
 * @swagger
 * /api/apiKeys:
 *   get:
 *     summary: Get Apikeys /
 *     tags: [Apikeys]
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

router.get("/", getApiKeys);

// Get specific API key
/**
 * @swagger
 * /api/apiKeys/{keyId}:
 *   get:
 *     summary: Get Apikeys /:keyId
 *     tags: [Apikeys]
 *     parameters:
 *       - in: path
 *         name: keyId
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

router.get("/:keyId", getApiKey);

// Get API key statistics
/**
 * @swagger
 * /api/apiKeys/{keyId}/stats:
 *   get:
 *     summary: Get Apikeys /:keyId/stats
 *     tags: [Apikeys]
 *     parameters:
 *       - in: path
 *         name: keyId
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

router.get("/:keyId/stats", getApiKeyStats);

// Get API key rotation logs
/**
 * @swagger
 * /api/apiKeys/{keyId}/rotation-logs:
 *   get:
 *     summary: Get Apikeys /:keyId/rotation-logs
 *     tags: [Apikeys]
 *     parameters:
 *       - in: path
 *         name: keyId
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

router.get("/:keyId/rotation-logs", getApiKeyAuditLogs);

// Update API key
/**
 * @swagger
 * /api/apiKeys/{keyId}:
 *   patch:
 *     summary: Patch Apikeys /:keyId
 *     tags: [Apikeys]
 *     parameters:
 *       - in: path
 *         name: keyId
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

router.patch("/:keyId", validate(updateApiKeySchema), auditLog("api_keys"), updateApiKey);

// Rotate API key (create new, revoke old)
/**
 * @swagger
 * /api/apiKeys/{keyId}/rotate:
 *   post:
 *     summary: Post Apikeys /:keyId/rotate
 *     tags: [Apikeys]
 *     parameters:
 *       - in: path
 *         name: keyId
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

router.post("/:keyId/rotate", strictLimiter, auditLog("api_keys"), rotateApiKey);

// Revoke API key
/**
 * @swagger
 * /api/apiKeys/{keyId}:
 *   delete:
 *     summary: Delete Apikeys /:keyId
 *     tags: [Apikeys]
 *     parameters:
 *       - in: path
 *         name: keyId
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

router.delete("/:keyId", auditLog("api_keys"), revokeApiKey);

export default router;
