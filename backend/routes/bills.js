import express from 'express';
import BillPaymentController from '../controllers/BillPaymentController.js';
import { authenticateToken } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter for bill payments (stricter limit)
const billPaymentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // limit each user to 5 payment requests per minute
    message: { status: 'error', message: 'Too many bill payment requests, please try again later.' },
    keyGenerator: (req) => req.user?.id || req.ip // Rate limit per user ID if authenticated
});

// Public routes (no auth required)
router.get('/categories', BillPaymentController.getCategories);
router.get('/providers/:category', BillPaymentController.getProviders);

// Protected routes (require authentication)
router.post('/pay', authenticateToken, billPaymentLimiter, BillPaymentController.pay);

export default router;
