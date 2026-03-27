import CircuitBreakerService from '../services/CircuitBreakerService.js';
import logger from '../utils/logger.js';

export const circuitBreakerMetrics = (req, res, next) => {
    // This middleware could be used to attach circuit breaker status to every response
    // or as a standalone endpoint for monitoring.
    
    // We can also use it to expose stats on a specific route.
    if (req.path === '/admin/circuit-breakers/stats') {
        const stats = CircuitBreakerService.getStats();
        return res.json({
            success: true,
            data: stats
        });
    }
    
    next();
};
