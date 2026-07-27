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

/**
 * @swagger
 * tags:
 *   name: Bill Payments
 *   description: Nigerian bill payments (airtime, data, TV, electricity, betting)
 */

/**
 * @swagger
 * /api/bills/categories:
 *   get:
 *     summary: List all bill payment categories
 *     description: Returns all available bill payment categories (airtime, data, TV, electricity, betting).
 *     tags: [Bill Payments]
 *     responses:
 *       200:
 *         description: List of bill categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "airtime"
 *                       name:
 *                         type: string
 *                         example: "Airtime Top-Up"
 *                       description:
 *                         type: string
 *                         example: "Recharge your mobile phone"
 */
router.get('/categories', BillPaymentController.getCategories);

/**
 * @swagger
 * /api/bills/providers/{category}:
 *   get:
 *     summary: List providers for a bill category
 *     description: Returns all available service providers for a specific category (e.g., MTN, Airtel for airtime; DSTV, GOTV for TV).
 *     tags: [Bill Payments]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [airtime, data, tv, electricity, betting]
 *         description: Bill payment category
 *     responses:
 *       200:
 *         description: List of providers for the category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       logo:
 *                         type: string
 *       404:
 *         description: Category not found
 */
router.get('/providers/:category', BillPaymentController.getProviders);

/**
 * @swagger
 * /api/bills/pay:
 *   post:
 *     summary: Pay a bill
 *     description: Initiate a bill payment. Requires authentication and rate-limited to 5 requests per minute.
 *     tags: [Bill Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *               - provider
 *               - amount
 *             properties:
 *               category:
 *                 type: string
 *                 example: "airtime"
 *               provider:
 *                 type: string
 *                 example: "mtn"
 *               amount:
 *                 type: number
 *                 example: 500
 *               phone:
 *                 type: string
 *                 example: "08012345678"
 *               smartCardNumber:
 *                 type: string
 *                 description: Required for TV/electricity payments
 *               variation:
 *                 type: string
 *                 description: Specific plan/variation code
 *     responses:
 *       200:
 *         description: Bill payment initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     reference:
 *                       type: string
 *                       example: "BILL_ref_abc123"
 *                     status:
 *                       type: string
 *                       example: "processing"
 *       400:
 *         description: Invalid request or missing fields
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Too many bill payment requests
 */
router.post('/pay', authenticateToken, billPaymentLimiter, BillPaymentController.pay);

export default router;
