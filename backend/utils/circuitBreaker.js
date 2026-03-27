import CircuitBreaker from 'opossum';
import { circuitBreakerConfig } from '../config/circuitBreaker.js';
import logger from '../utils/logger.js';

/**
 * Creates a circuit breaker for a given function and service key
 * @param {Function} action - The async function to wrap
 * @param {string} serviceKey - The key from circuitBreakerConfig.services
 * @returns {CircuitBreaker}
 */
export const createCircuitBreaker = (action, serviceKey) => {
    const serviceOptions = circuitBreakerConfig.services[serviceKey] || {};
    const options = {
        ...circuitBreakerConfig.default,
        ...serviceOptions
    };

    const breaker = new CircuitBreaker(action, options);

    breaker.on('open', () => logger.warn(`Circuit Breaker OPEN: ${options.name || serviceKey}`));
    breaker.on('halfOpen', () => logger.info(`Circuit Breaker HALF-OPEN: ${options.name || serviceKey}`));
    breaker.on('close', () => logger.info(`Circuit Breaker CLOSED: ${options.name || serviceKey}`));
    breaker.on('fallback', (result) => logger.warn(`Circuit Breaker FALLBACK: ${options.name || serviceKey}`));

    if (serviceOptions.fallback) {
        breaker.fallback(serviceOptions.fallback);
    }

    return breaker;
};
