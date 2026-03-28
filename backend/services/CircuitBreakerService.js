import { createCircuitBreaker } from '../utils/circuitBreaker.js';
import logger from '../utils/logger.js';

class CircuitBreakerService {
    constructor() {
        this.breakers = new Map();
    }

    /**
     * Get or create a circuit breaker for a service
     * @param {string} serviceKey - Unique key for the service
     * @returns {CircuitBreaker}
     */
    getBreaker(serviceKey) {
        if (!this.breakers.has(serviceKey)) {
            logger.info(`Initializing Circuit Breaker for: ${serviceKey}`);
            // Use a generic runner so multiple actions can share the same breaker stats
            const genericRunner = (task, ...args) => task(...args);
            const breaker = createCircuitBreaker(genericRunner, serviceKey);
            this.breakers.set(serviceKey, breaker);
        }
        return this.breakers.get(serviceKey);
    }

    /**
     * Executes an action wrapped in a circuit breaker
     * @param {string} serviceKey - Service key
     * @param {Function} action - Async function to execute
     * @param {...any} args - Arguments to pass to the action
     */
    async fire(serviceKey, action, ...args) {
        const breaker = this.getBreaker(serviceKey);
        return breaker.fire(action, ...args);
    }

    /**
     * Returns the status of all registered circuit breakers
     */
    getStats() {
        const stats = {};
        for (const [key, breaker] of this.breakers.entries()) {
            stats[key] = {
                name: breaker.name,
                state: breaker.opened ? 'OPEN' : (breaker.halfOpen ? 'HALF-OPEN' : 'CLOSED'),
                stats: breaker.stats,
                enabled: breaker.enabled,
                warmUp: breaker.warmUp
            };
        }
        return stats;
    }

    /**
     * Manually resets a circuit breaker
     * @param {string} serviceKey 
     */
    resetBreaker(serviceKey) {
        const breaker = this.breakers.get(serviceKey);
        if (breaker) {
            breaker.close();
            return true;
        }
        return false;
    }
}

export default new CircuitBreakerService();
