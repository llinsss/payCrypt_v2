import { jest } from '@jest/globals';

// For ESM mocking in Jest, we need to handle the default exports and hoist manually if needed
// Or use spies on the imported modules if they are configurable

import redis from '../config/redis.js';
import IdempotencyService from '../services/IdempotencyService.js';

describe('IdempotencyService', () => {
    const testKey = 'test-key';
    const fullKey = `idempotency:${testKey}`;

    beforeAll(() => {
        // Manually mock redis methods if they are not already mocks
        if (!redis.get.mock) redis.get = jest.fn();
        if (!redis.set.mock) redis.set = jest.fn();
        if (!redis.del.mock) redis.del = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getRecord', () => {
        it('should return parsed data if key exists', async () => {
            const mockData = JSON.stringify({ status: 'completed', response: { success: true } });
            jest.spyOn(redis, 'get').mockResolvedValue(mockData);

            const result = await IdempotencyService.getRecord(testKey);

            expect(redis.get).toHaveBeenCalledWith(fullKey);
            expect(result).toEqual(JSON.parse(mockData));
        });

        it('should return null if key does not exist', async () => {
            jest.spyOn(redis, 'get').mockResolvedValue(null);

            const result = await IdempotencyService.getRecord(testKey);

            expect(result).toBeNull();
        });
    });

    describe('saveResponse', () => {
        it('should save response with default TTL', async () => {
            const mockResponse = { success: true };
            jest.spyOn(redis, 'set').mockResolvedValue('OK');

            await IdempotencyService.saveResponse(testKey, mockResponse);

            expect(redis.set).toHaveBeenCalledWith(
                fullKey,
                expect.stringContaining('"status":"completed"'),
                expect.objectContaining({ EX: 86400 })
            );
        });

        it('should save response with custom TTL', async () => {
            const mockResponse = { success: true };
            const customTtl = 3600;
            jest.spyOn(redis, 'set').mockResolvedValue('OK');

            await IdempotencyService.saveResponse(testKey, mockResponse, customTtl);

            expect(redis.set).toHaveBeenCalledWith(
                fullKey,
                expect.any(String),
                expect.objectContaining({ EX: customTtl })
            );
        });
    });

    describe('setLock', () => {
        it('should acquire lock if key does not exist', async () => {
            jest.spyOn(redis, 'set').mockResolvedValue('OK');

            const result = await IdempotencyService.setLock(testKey);

            expect(redis.set).toHaveBeenCalledWith(
                fullKey,
                expect.stringContaining('"status":"in-progress"'),
                expect.objectContaining({ NX: true, EX: 60 })
            );
            expect(result).toBe(true);
        });

        it('should return false if lock acquisition fails', async () => {
            jest.spyOn(redis, 'set').mockResolvedValue(null);

            const result = await IdempotencyService.setLock(testKey);

            expect(result).toBe(false);
        });
    });

    describe('deleteRecord', () => {
        it('should delete record from redis', async () => {
            jest.spyOn(redis, 'del').mockResolvedValue(1);
            await IdempotencyService.deleteRecord(testKey);

            expect(redis.del).toHaveBeenCalledWith(fullKey);
        });
    });
});
