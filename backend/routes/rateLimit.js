import express from "express";
import {
  getRateLimitSettings,
  getUserRateLimitStatus,
  updateUserTier,
  getApiKeyRateLimit,
  updateApiKeyRateLimit,
  getRateLimitViolations,
} from "../controllers/rateLimitController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Rate Limit Admin
 *   description: Rate limit configuration and monitoring (Admin dashboard)
 */

/**
 * @swagger
 * /admin/rate-limits/settings:
 *   get:
 *     summary: Get current rate limit settings
 *     description: Returns the configured rate limit thresholds for each endpoint tier.
 *     tags: [Rate Limit Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rate limit configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Rate limit settings per endpoint
 *       401:
 *         description: Unauthorized
 */
router.get("/settings", getRateLimitSettings);

/**
 * @swagger
 * /admin/rate-limits/users/{userId}:
 *   get:
 *     summary: Get a user's rate limit status
 *     description: Returns the current rate limit counters and remaining quota for a specific user.
 *     tags: [Rate Limit Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User rate limit status
 *       401:
 *         description: Unauthorized
 */
router.get("/users/:userId", getUserRateLimitStatus);

/**
 * @swagger
 * /admin/rate-limits/users/{userId}/tier:
 *   put:
 *     summary: Update a user's rate limit tier
 *     description: Change a user's rate limit tier (e.g., from free to premium) to adjust their quota.
 *     tags: [Rate Limit Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tier
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [free, basic, premium, enterprise]
 *                 example: "premium"
 *     responses:
 *       200:
 *         description: User tier updated
 *       401:
 *         description: Unauthorized
 */
router.put("/users/:userId/tier", updateUserTier);

/**
 * @swagger
 * /admin/rate-limits/api-keys/{keyId}:
 *   get:
 *     summary: Get an API key's rate limit status
 *     tags: [Rate Limit Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key rate limit status
 *       401:
 *         description: Unauthorized
 */
router.get("/api-keys/:keyId", getApiKeyRateLimit);

/**
 * @swagger
 * /admin/rate-limits/api-keys/{keyId}/rate-limit:
 *   put:
 *     summary: Update an API key's rate limit configuration
 *     tags: [Rate Limit Admin]
 *     security:
 *       - bearerAuth: []
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
 *               maxRequests:
 *                 type: integer
 *                 example: 5000
 *               windowMs:
 *                 type: integer
 *                 example: 3600000
 *     responses:
 *       200:
 *         description: API key rate limit updated
 *       401:
 *         description: Unauthorized
 */
router.put("/api-keys/:keyId/rate-limit", updateApiKeyRateLimit);

/**
 * @swagger
 * /admin/rate-limits/violations:
 *   get:
 *     summary: Get rate limit violations log
 *     description: Returns a log of recent rate limit violations across all users and API keys.
 *     tags: [Rate Limit Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Violations log
 *       401:
 *         description: Unauthorized
 */
router.get("/violations", getRateLimitViolations);

export default router;
