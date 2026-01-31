import express from 'express';
import { getHealth } from '../controllers/healthController.js';

const router = express.Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: System health check
 *     description: |
 *       Returns the health status of the system including database connectivity,
 *       Redis connection, and Stellar network status.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [connected, disconnected]
 *                       example: "connected"
 *                     redis:
 *                       type: string
 *                       enum: [connected, disconnected]
 *                       example: "connected"
 *                     stellar:
 *                       type: string
 *                       enum: [connected, disconnected]
 *                       example: "connected"
 *       500:
 *         description: One or more services are down
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "degraded"
 *                 services:
 *                   type: object
 */
router.get('/', getHealth);

export default router;
