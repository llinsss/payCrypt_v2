import CircuitBreakerService from '../services/CircuitBreakerService.js';

/**
 * Controller for managing circuit breakers
 */
export const getCircuitBreakerStats = async (req, res) => {
    try {
        const stats = CircuitBreakerService.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch circuit breaker statistics',
            error: error.message
        });
    }
};

export const resetCircuitBreaker = async (req, res) => {
    try {
        const { serviceKey } = req.params;
        const reset = CircuitBreakerService.resetBreaker(serviceKey);
        
        if (reset) {
            res.json({
                success: true,
                message: `Circuit breaker for ${serviceKey} has been reset`
            });
        } else {
            res.status(404).json({
                success: false,
                message: `Circuit breaker for ${serviceKey} not found`
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to reset circuit breaker',
            error: error.message
        });
    }
};
