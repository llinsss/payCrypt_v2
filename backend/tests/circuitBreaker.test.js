import { jest } from '@jest/globals';
import CircuitBreakerService from '../services/CircuitBreakerService.js';

describe('Circuit Breaker Pattern', () => {
    let mockAction;
    const serviceKey = 'test-service';

    beforeEach(() => {
        mockAction = jest.fn();
        // Clear any existing breakers for testing
        CircuitBreakerService.breakers.clear();
    });

    test('should be CLOSED initially and execute action', async () => {
        mockAction.mockResolvedValue('success');
        const result = await CircuitBreakerService.fire(serviceKey, mockAction);
        
        expect(result).toBe('success');
        const stats = CircuitBreakerService.getStats()[serviceKey];
        expect(stats.state).toBe('CLOSED');
    });

    test('should open the circuit after failures', async () => {
        mockAction.mockRejectedValue(new Error('failure'));
        
        const breaker = CircuitBreakerService.getBreaker(serviceKey);
        
        // Fail multiple times
        for (let i = 0; i < 10; i++) {
            try {
                await breaker.fire(mockAction);
            } catch (e) {
                // ignore
            }
        }

        const stats = CircuitBreakerService.getStats()[serviceKey];
        expect(stats.state).toBe('OPEN');
    });

    test('should return fallback if circuit is OPEN', async () => {
        const breaker = CircuitBreakerService.getBreaker(serviceKey);
        breaker.open(); // Manually open the circuit

        const fallbackAction = jest.fn().mockReturnValue('fallback result');
        breaker.fallback(fallbackAction);

        // When OPEN, fire should return fallback
        const result = await breaker.fire(mockAction);
        expect(result).toBe('fallback result');
        expect(fallbackAction).toHaveBeenCalled();
    });

    test('should reset after manual reset call', async () => {
        const breaker = CircuitBreakerService.getBreaker(serviceKey);
        breaker.open();
        
        CircuitBreakerService.resetBreaker(serviceKey);
        const stats = CircuitBreakerService.getStats()[serviceKey];
        expect(stats.state).toBe('CLOSED');
    });
});
