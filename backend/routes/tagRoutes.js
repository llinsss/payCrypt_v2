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

/**
 * @swagger
 * tags:
 *   name: Tags
 *   description: Tag (@Tag) resolution, registration, and transfer
 */

/**
 * @swagger
 * /api/tags/search:
 *   get:
 *     summary: Search for tags
 *     description: Search registered tags by name. Rate-limited to 10 requests per minute per IP.
 *     tags: [Tags]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query string
 *     responses:
 *       200:
 *         description: Search results
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
 *                       tag:
 *                         type: string
 *                         example: "alice"
 *                       walletAddress:
 *                         type: string
 *                       chain:
 *                         type: string
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/search', checkLimiter, TagController.search);

/**
 * @swagger
 * /api/tags:
 *   post:
 *     summary: Register a new tag
 *     description: Create and register a unique @tag for a user. The tag must be 3-20 alphanumeric characters (underscores allowed).
 *     tags: [Tags]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tag
 *             properties:
 *               tag:
 *                 type: string
 *                 pattern: "^[a-zA-Z0-9_]{3,20}$"
 *                 example: "john_lagos"
 *               userId:
 *                 type: string
 *                 description: User ID to associate with the tag
 *     responses:
 *       201:
 *         description: Tag registered successfully
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
 *                     tag:
 *                       type: string
 *                       example: "john_lagos"
 *                     walletAddress:
 *                       type: string
 *       400:
 *         description: Validation error or tag already taken
 */
router.post('/', TagController.create);

/**
 * @swagger
 * /api/tags/check/{tag}:
 *   get:
 *     summary: Check if a tag is available for registration
 *     description: Returns whether a specific tag name is available (not yet registered).
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: Tag name to check
 *     responses:
 *       200:
 *         description: Tag availability status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                   example: true
 *                 tag:
 *                   type: string
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/check/:tag', checkLimiter, TagController.check);

/**
 * @swagger
 * /api/tags/{tag}:
 *   get:
 *     summary: Resolve a tag to its wallet address
 *     description: Given a @tag, return the associated wallet address and chain information.
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: Tag name to resolve
 *     responses:
 *       200:
 *         description: Tag resolved successfully
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
 *                     tag:
 *                       type: string
 *                       example: "alice"
 *                     walletAddress:
 *                       type: string
 *                       example: "0x1234567890abcdef"
 *                     chain:
 *                       type: string
 *                       example: "flow"
 *       404:
 *         description: Tag not found
 */
router.get('/:tag', TagController.resolve);

/**
 * @swagger
 * /api/tags/{tag}/transfer:
 *   put:
 *     summary: Transfer a tag to another user
 *     description: Transfer ownership of a @tag to a different user. Requires authentication as the current tag owner.
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
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
 *             required:
 *               - newOwnerId
 *             properties:
 *               newOwnerId:
 *                 type: string
 *                 example: "user_uuid_456"
 *     responses:
 *       200:
 *         description: Tag transferred successfully
 *       403:
 *         description: Not the current tag owner
 *       404:
 *         description: Tag not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:tag/transfer', authenticate, TagController.transfer);

export default router;
