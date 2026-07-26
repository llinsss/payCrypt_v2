import express from 'express';
import TagController from '../controllers/TagController.js';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const checkLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per windowMs
    message: { status: 'error', message: 'Too many requests, please try again later.' }
});

// Public route to resolve tag? Or protected?
// Requirements: "Implement tag reservation system".
// Usually creation requires auth, resolution is public.
// I'll make resolve public, create/transfer potentially protected, but for "Core Resolution System" I will leave them open or add TODOs for auth if not explicitly asked to integrate with existing auth.
// "Prevent duplicate tag registration" implies anyone can register if unique.

/**
 * @swagger
 * /api/tags:
 *   post:
 *     summary: Post Tagroutes /
 *     tags: [Tagroutes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/search', checkLimiter, TagController.search);
router.post('/', TagController.create);
/**
 * @swagger
 * /api/tags/check/{tag}:
 *   get:
 *     summary: Get Tagroutes /check/:tag
 *     tags: [Tagroutes]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.get('/check/:tag', checkLimiter, TagController.check);
/**
 * @swagger
 * /api/tags/{tag}:
 *   get:
 *     summary: Get Tagroutes /:tag
 *     tags: [Tagroutes]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.get('/:tag', TagController.resolve);
/**
 * @swagger
 * /api/tags/{tag}/transfer:
 *   put:
 *     summary: Put Tagroutes /:tag/transfer
 *     tags: [Tagroutes]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/:tag/transfer', authenticate, TagController.transfer);

export default router;
