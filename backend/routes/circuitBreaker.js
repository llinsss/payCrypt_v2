import express from 'express';
import { getCircuitBreakerStats, resetCircuitBreaker } from '../controllers/circuitBreakerController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/audit.js';

const router = express.Router();

// Protect inspection and reset endpoints. Operational state must not be
// publicly readable, and resetting a breaker must require an authenticated
// admin (see issue #553).
router.use(authenticate);
router.use(requireAdmin);

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
 *     description: Returns the current state (open, half-open, closed) and failure counts for each monitored blockchain service. Admin only.
 *     tags: [Circuit Breaker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       401:
 *         description: Access token required
 *       403:
 *         description: Admin access required
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
 *     description: Manually reset a circuit breaker from open/half-open state back to closed. Admin only. Use with caution.
 *     tags: [Circuit Breaker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serviceKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Service key to reset (e.g., stellar_payment, evm_transfer)
 *     responses:
 *       401:
 *         description: Access token required
 *       403:
 *         description: Admin access required
 *       429:
 *         description: Too many reset attempts, slow down
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
// Reset is destructive and allows an attacker to defeat outage protection,
// so it is rate-limited (defaults to a modest per-IP allowance) and every
// successful reset is written to the audit log.
router.post('/reset/:serviceKey', rateLimit({ endpointName: 'circuit-breaker-reset', windowMs: 60 * 60 * 1000, max: 10 }), auditLog('circuit_breaker'), resetCircuitBreaker);

export default router;
