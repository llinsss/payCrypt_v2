import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

// We must mock the modules BEFORE importing the routes that use them
jest.unstable_mockModule('../models/Transaction.js', () => ({
    default: {
        findById: jest.fn(),
        update: jest.fn(),
    }
}));

// Mock middleware
jest.unstable_mockModule('../middleware/auth.js', () => ({
    authenticate: (req, res, next) => {
        req.user = { id: 1 };
        next();
    },
    authenticateJwtOrApiKey: (req, res, next) => {
        req.user = { id: 1 };
        next();
    },
    userRateLimiter: (req, res, next) => next()
}));

jest.unstable_mockModule('../middleware/audit.js', () => ({
    auditLog: () => (req, res, next) => next()
}));

jest.unstable_mockModule('../config/rateLimiting.js', () => ({
    paymentLimiter: (req, res, next) => next(),
    exportLimiter: (req, res, next) => next(),
    downloadLimiter: (req, res, next) => next(),
    userRateLimiter: (req, res, next) => next()
}));

jest.unstable_mockModule('../controllers/exportController.js', () => ({
    exportTransactions: (req, res) => res.send('exported'),
    downloadExport: (req, res) => res.send('downloaded')
}));

// Now import the modules
const { default: Transaction } = await import('../models/Transaction.js');
const { default: transactionRoutes } = await import('../routes/transactions.js');

const app = express();
app.use(express.json());
app.use('/api/transactions', transactionRoutes);

describe('Mass Assignment Vulnerability Fix Verification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should only allow updating notes and ignore sensitive fields', async () => {
        const mockTransaction = { id: 123, user_id: 1, status: 'pending', notes: 'old note' };
        Transaction.findById.mockResolvedValue(mockTransaction);
        Transaction.update.mockResolvedValue({ ...mockTransaction, notes: 'new note' });

        const response = await request(app)
            .put('/api/transactions/123')
            .send({
                notes: 'new note',
                status: 'completed',
                user_id: 999
            });

        expect(response.status).toBe(200);

        // Match only notes
        expect(Transaction.update).toHaveBeenCalledWith(123, { notes: 'new note' });
    });

    it('should return 400 if only unauthorized fields are provided', async () => {
        const mockTransaction = { id: 123, user_id: 1 };
        Transaction.findById.mockResolvedValue(mockTransaction);

        const response = await request(app)
            .put('/api/transactions/123')
            .send({
                status: 'completed'
            });

        expect(response.status).toBe(400);
        expect(response.body.errors[0].message).toContain('At least one field must be provided');
    });
});
