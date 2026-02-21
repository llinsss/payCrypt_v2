import express from 'express';
import { getHealth, getReadiness, getLiveness } from '../controllers/healthController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Health
 *   description: System health and readiness checks
 */

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Get overall system health
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
 *                   example: OK
 *       500:
 *         description: System is unhealthy
 */
router.get('/', getHealth);

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     summary: Readiness probe
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is ready to accept traffic
 *       503:
 *         description: System is not ready
 */
router.get('/ready', getReadiness);

/**
 * @swagger
 * /api/health/live:
 *   get:
 *     summary: Liveness probe
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is alive
 *       503:
 *         description: System is not alive
 */
router.get('/live', getLiveness);

export default router;
