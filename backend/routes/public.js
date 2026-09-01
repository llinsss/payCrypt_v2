import express from "express";
import { rateLimit } from "../middleware/rateLimiter.js";
import { publicCache } from "../middleware/cacheControl.js";
import { getPublicStats } from "../controllers/publicController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Public endpoints (no authentication required) — platform statistics, general info
 */

/**
 * @swagger
 * /api/v1/public/stats:
 *   get:
 *     summary: Get live platform statistics
 *     description: Returns aggregated statistics about the platform — total transactions, users, volume, and supported chains. Data is cached for 5 minutes. No authentication required.
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Platform statistics
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
 *                     totalTransactions:
 *                       type: integer
 *                       example: 45320
 *                     totalUsers:
 *                       type: integer
 *                       example: 8750
 *                     totalVolume:
 *                       type: number
 *                       example: 5234560.50
 *                     totalVolumeCurrency:
 *                       type: string
 *                       example: "USD"
 *                     supportedChains:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["stellar", "ethereum", "polygon"]
 *       500:
 *         description: Server error
 */
router.get(
  "/stats",
  rateLimit({ endpointName: "public-stats", windowMs: 60 * 1000, max: 100 }),
  publicCache("5 minutes"),
  getPublicStats
);

export default router;
