import express from "express";
import { getPerformanceMetrics, resetPerformanceMetrics } from "../controllers/performanceController.js";
import { authenticate, isAdmin } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * /api/performance:
 *   get:
 *     summary: Get performance metrics
 *     tags: [Performance]
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       500:
 *         description: Internal server error
 */
// Protected routes - only admins can access performance metrics
router.get("/", authenticate, isAdmin, getPerformanceMetrics);

/**
 * @swagger
 * /api/performance/reset:
 *   post:
 *     summary: Reset performance metrics
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics reset
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       500:
 *         description: Internal server error
 */
router.post("/reset", authenticate, isAdmin, resetPerformanceMetrics);

export default router;
