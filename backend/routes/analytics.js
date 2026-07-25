import express from "express";
import * as AnalyticsController from "../controllers/analyticsController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Admin-only analytics and reporting endpoints (Redis-cached, 5 min TTL)
 */

// Analytics endpoints require admin privileges
router.use(authenticate);
router.use(requireAdmin);

/**
 * @swagger
 * components:
 *   schemas:
 *     AnalyticsVolumePoint:
 *       type: object
 *       properties:
 *         date: { type: string, example: "2024-02-20" }
 *         volume: { type: number, example: 45000.0 }
 *         count: { type: integer, example: 120 }
 *     AnalyticsTokenStat:
 *       type: object
 *       properties:
 *         symbol: { type: string, example: "XLM" }
 *         volume: { type: number, example: 500000.0 }
 *         count: { type: integer, example: 2500 }
 *     AnalyticsChainStat:
 *       type: object
 *       properties:
 *         chainId: { type: string, example: "1" }
 *         chainName: { type: string, example: "Stellar" }
 *         count: { type: integer, example: 3000 }
 *         volume: { type: number, example: 750000.0 }
 */

/**
 * @swagger
 * /api/analytics/volume:
 *   get:
 *     summary: Transaction volume aggregated by period
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [daily, weekly, monthly], default: daily }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date, example: "2024-01-01" }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date, example: "2024-12-31" }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Volume by period
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AnalyticsVolumePoint' }
 *       403:
 *         description: Admin access required
 */
router.get("/volume", AnalyticsController.getVolume);

/**
 * @swagger
 * /api/analytics/average-size:
 *   get:
 *     summary: Average transaction size
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [all, daily, weekly, monthly], default: all }
 *     responses:
 *       200: { description: Average transaction size }
 *       403: { description: Admin access required }
 */
router.get("/average-size", AnalyticsController.getAverageTransactionSize);

/**
 * @swagger
 * /api/analytics/success-rate:
 *   get:
 *     summary: Transaction success/failure rate
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Transaction success rate }
 *       403: { description: Admin access required }
 */
router.get("/success-rate", AnalyticsController.getTransactionSuccessRate);

/**
 * @swagger
 * /api/analytics/user-growth:
 *   get:
 *     summary: New and cumulative user growth by period
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [daily, weekly, monthly], default: daily }
 *     responses:
 *       200: { description: User growth series }
 *       403: { description: Admin access required }
 */
router.get("/user-growth", AnalyticsController.getUserGrowth);

/**
 * @swagger
 * /api/analytics/time-series:
 *   get:
 *     summary: Transaction count and volume time series
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [daily, weekly, monthly], default: daily }
 *     responses:
 *       200: { description: Time series data }
 *       403: { description: Admin access required }
 */
router.get("/time-series", AnalyticsController.getTimeSeriesData);

/**
 * @swagger
 * /api/analytics/dashboard-summary:
 *   get:
 *     summary: High-level dashboard summary (volume, success rate, users)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Dashboard summary }
 *       403: { description: Admin access required }
 */
router.get("/dashboard-summary", AnalyticsController.getDashboardSummary);

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Full analytics overview (summary + volume trend + top tokens/chains)
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date, example: "2024-01-01" }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date, example: "2024-12-31" }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Aggregated overview statistics
 *       403:
 *         description: Admin access required
 */
router.get("/overview", AnalyticsController.getOverview);

/**
 * @swagger
 * /api/analytics/tokens:
 *   get:
 *     summary: Top tokens by volume and transaction count
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Top tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AnalyticsTokenStat' }
 *       403:
 *         description: Admin access required
 */
router.get("/tokens", AnalyticsController.getTokens);

/**
 * @swagger
 * /api/analytics/chains:
 *   get:
 *     summary: Top chains by transaction count and volume
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Top chains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AnalyticsChainStat' }
 *       403:
 *         description: Admin access required
 */
router.get("/chains", AnalyticsController.getChains);

export default router;
