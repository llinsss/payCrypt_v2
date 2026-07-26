import express from 'express';
import { getCircuitBreakerStats, resetCircuitBreaker } from '../controllers/circuitBreakerController.js';

const router = express.Router();

/**
 * @swagger
 * /api/circuit-breaker/stats:
 *   get:
 *     summary: Get circuit breaker statistics
 *     tags: [Circuit Breaker]
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
 *       500:
 *         description: Internal server error
 */
router.get('/stats', getCircuitBreakerStats);

/**
 * @swagger
 * /api/circuit-breaker/reset/{serviceKey}:
 *   post:
 *     summary: Reset the circuit breaker for a service
 *     tags: [Circuit Breaker]
 *     parameters:
 *       - in: path
 *         name: serviceKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Key identifying the service to reset
 *     responses:
 *       200:
 *         description: Circuit breaker reset
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/reset/:serviceKey', resetCircuitBreaker);

export default router;
