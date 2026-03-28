import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import { idempotency } from '../middleware/idempotency.js';
import IdempotencyService from '../services/IdempotencyService.js';

const app = express();
app.use(express.json());

// Mock authentication middleware
const mockAuth = (req, res, next) => {
    req.user = { id: 1 };
    next();
};

app.post('/test-idempotency', mockAuth, idempotency, (req, res) => {
    res.status(201).json({ success: true, data: 'processed' });
});

app.post('/test-error', mockAuth, idempotency, (req, res) => {
    res.status(500).json({ error: 'internal error' });
});

describe('Idempotency Middleware Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Re-mocking methods because ESM hoisting issues
        jest.spyOn(IdempotencyService, 'getRecord').mockImplementation(() => Promise.resolve(null));
        jest.spyOn(IdempotencyService, 'setLock').mockImplementation(() => Promise.resolve(true));
        jest.spyOn(IdempotencyService, 'saveResponse').mockImplementation(() => Promise.resolve());
        jest.spyOn(IdempotencyService, 'deleteRecord').mockImplementation(() => Promise.resolve());
    });

    it('should return 400 if X-Idempotency-Key is missing', async () => {
        const response = await request(app).post('/test-idempotency').send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Idempotency key required');
    });

    it('should proceed and cache response if key is new', async () => {
        jest.spyOn(IdempotencyService, 'getRecord').mockResolvedValue(null);
        jest.spyOn(IdempotencyService, 'setLock').mockResolvedValue(true);

        const response = await request(app)
            .post('/test-idempotency')
            .set('X-Idempotency-Key', 'new-key')
            .send({ amount: 100 });

        expect(response.status).toBe(201);
        expect(response.body.data).toBe('processed');
        expect(IdempotencyService.setLock).toHaveBeenCalledWith('new-key');

        // Pulse to ensure async saveResponse is called
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(IdempotencyService.saveResponse).toHaveBeenCalled();
    });

    it('should return cached response if key exists and status is completed', async () => {
        const cachedResponse = { success: true, data: 'cached-data' };
        jest.spyOn(IdempotencyService, 'getRecord').mockResolvedValue({
            status: 'completed',
            response: cachedResponse
        });

        const response = await request(app)
            .post('/test-idempotency')
            .set('X-Idempotency-Key', 'completed-key')
            .send({});

        expect(response.status).toBe(200);
        expect(response.body).toEqual(cachedResponse);
        expect(IdempotencyService.setLock).not.toHaveBeenCalled();
    });

    it('should return 409 if status is in-progress', async () => {
        jest.spyOn(IdempotencyService, 'getRecord').mockResolvedValue({
            status: 'in-progress'
        });

        const response = await request(app)
            .post('/test-idempotency')
            .set('X-Idempotency-Key', 'loading-key')
            .send({});

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Conflict');
    });

    it('should return 409 if lock acquisition fails (race condition)', async () => {
        jest.spyOn(IdempotencyService, 'getRecord').mockResolvedValue(null);
        jest.spyOn(IdempotencyService, 'setLock').mockResolvedValue(false);

        const response = await request(app)
            .post('/test-idempotency')
            .set('X-Idempotency-Key', 'race-key')
            .send({});

        expect(response.status).toBe(409);
    });

    it('should delete lock if backend returns 500', async () => {
        jest.spyOn(IdempotencyService, 'getRecord').mockResolvedValue(null);
        jest.spyOn(IdempotencyService, 'setLock').mockResolvedValue(true);

        const response = await request(app)
            .post('/test-error')
            .set('X-Idempotency-Key', 'error-key')
            .send({});

        expect(response.status).toBe(500);
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(IdempotencyService.deleteRecord).toHaveBeenCalledWith('error-key');
    });
});
