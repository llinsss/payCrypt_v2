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
 * /admin/rate-limits/settings:
 *   get:
 *     summary: Get Ratelimit /settings
 *     tags: [Ratelimit]
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

router.get("/settings", getRateLimitSettings);

/**
 * @swagger
 * /admin/rate-limits/users/{userId}:
 *   get:
 *     summary: Get Ratelimit /users/:userId
 *     tags: [Ratelimit]
 *     parameters:
 *       - in: path
 *         name: userId
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

router.get("/users/:userId", getUserRateLimitStatus);

/**
 * @swagger
 * /admin/rate-limits/users/{userId}/tier:
 *   put:
 *     summary: Put Ratelimit /users/:userId/tier
 *     tags: [Ratelimit]
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

router.put("/users/:userId/tier", updateUserTier);

/**
 * @swagger
 * /admin/rate-limits/api-keys/{keyId}:
 *   get:
 *     summary: Get Ratelimit /api-keys/:keyId
 *     tags: [Ratelimit]
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

router.get("/api-keys/:keyId", getApiKeyRateLimit);

/**
 * @swagger
 * /admin/rate-limits/api-keys/{keyId}/rate-limit:
 *   put:
 *     summary: Put Ratelimit /api-keys/:keyId/rate-limit
 *     tags: [Ratelimit]
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

router.put("/api-keys/:keyId/rate-limit", updateApiKeyRateLimit);

/**
 * @swagger
 * /admin/rate-limits/violations:
 *   get:
 *     summary: Get Ratelimit /violations
 *     tags: [Ratelimit]
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

router.get("/violations", getRateLimitViolations);

export default router;
