import express from 'express';
import { getCircuitBreakerStats, resetCircuitBreaker } from '../controllers/circuitBreakerController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Circuit Breaker
 *   description: Circuit breaker status monitoring for blockchain service calls
 */

/**
 * @swagger
 * /api/circuit-breaker/stats:
 *   get:
 *     summary: Get circuit breaker statistics for all services
 *     description: Returns the current state (open, half-open, closed) and failure counts for each monitored blockchain service.
 *     tags: [Circuit Breaker]
 *     responses:
 *       200:
 *         description: Circuit breaker statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       serviceKey:
 *                         type: string
 *                         example: "stellar_payment"
 *                       state:
 *                         type: string
 *                         enum: [open, half-open, closed]
 *                         example: "closed"
 *                       failures:
 *                         type: integer
 *                         example: 0
 *                       lastFailure:
 *                         type: string
 *                         format: date-time
 */
router.get('/stats', getCircuitBreakerStats);

/**
 * @swagger
 * /api/circuit-breaker/reset/{serviceKey}:
 *   post:
 *     summary: Reset a circuit breaker for a specific service
 *     description: Manually reset a circuit breaker from open/half-open state back to closed. Use with caution.
 *     tags: [Circuit Breaker]
 *     parameters:
 *       - in: path
 *         name: serviceKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Service key to reset (e.g., stellar_payment, evm_transfer)
 *     responses:
 *       200:
 *         description: Circuit breaker reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Circuit breaker for stellar_payment has been reset"
 *       404:
 *         description: Service key not found
 */
router.post('/reset/:serviceKey', resetCircuitBreaker);

export default router;
