import express from "express";
import { getPerformanceMetrics, resetPerformanceMetrics } from "../controllers/performanceController.js";
import { authenticate, isAdmin } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Performance
 *   description: System performance metrics and monitoring (Admin only)
 */

/**
 * @swagger
 * /api/performance:
 *   get:
 *     summary: Get system performance metrics
 *     description: Returns response time averages, request counts, error rates, and resource utilization metrics. Admin access required.
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics
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
 *                     avgResponseTime:
 *                       type: number
 *                       example: 145.3
 *                       description: Average response time in milliseconds
 *                     totalRequests:
 *                       type: integer
 *                       example: 15234
 *                     errorRate:
 *                       type: number
 *                       example: 0.02
 *                       description: Error rate as percentage
 *                     p95ResponseTime:
 *                       type: number
 *                       example: 350
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get("/", authenticate, isAdmin, getPerformanceMetrics);

/**
 * @swagger
 * /api/performance/reset:
 *   post:
 *     summary: Reset performance metrics counters
 *     description: Reset all accumulated performance counters to zero. Admin access required.
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Performance metrics reset successfully"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post("/reset", authenticate, isAdmin, resetPerformanceMetrics);

export default router;
