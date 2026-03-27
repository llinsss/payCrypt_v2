import express from 'express';
import { getCircuitBreakerStats, resetCircuitBreaker } from '../controllers/circuitBreakerController.js';

const router = express.Router();

router.get('/stats', getCircuitBreakerStats);
router.post('/reset/:serviceKey', resetCircuitBreaker);

export default router;
