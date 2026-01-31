import express from 'express';
import TagController from '../controllers/TagController.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const checkLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per windowMs
    message: { status: 'error', message: 'Too many requests, please try again later.' }
});

/**
 * @swagger
 * /api/tags:
 *   post:
 *     summary: Create a new tag
 *     description: |
 *       Registers a new @tag mapped to a Stellar blockchain address.
 *       Tags must be unique and follow naming conventions.
 *     tags: [Tags]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tag
 *               - stellarAddress
 *             properties:
 *               tag:
 *                 type: string
 *                 description: Unique tag name (alphanumeric + underscores)
 *                 example: "johndoe"
 *               stellarAddress:
 *                 type: string
 *                 description: Stellar public key
 *                 example: "GABCDEFGHIJK..."
 *     responses:
 *       201:
 *         description: Tag created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   $ref: '#/components/schemas/Tag'
 *       400:
 *         description: Tag already exists or invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/', TagController.create);

/**
 * @swagger
 * /api/tags/check/{tag}:
 *   get:
 *     summary: Check tag availability
 *     description: |
 *       Checks whether a @tag is available for registration.
 *       Rate limited to 10 checks per minute per IP.
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: Tag to check
 *         example: "johndoe"
 *     responses:
 *       200:
 *         description: Tag availability status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 available:
 *                   type: boolean
 *                   example: true
 *                 tag:
 *                   type: string
 *                   example: "johndoe"
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/check/:tag', checkLimiter, TagController.check);

/**
 * @swagger
 * /api/tags/{tag}:
 *   get:
 *     summary: Resolve tag to address
 *     description: Resolves a @tag to its associated Stellar blockchain address (public endpoint).
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: Tag to resolve
 *         example: "johndoe"
 *     responses:
 *       200:
 *         description: Tag resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     tag:
 *                       type: string
 *                       example: "johndoe"
 *                     stellar_address:
 *                       type: string
 *                       example: "GABCDEFGHIJK..."
 *       404:
 *         description: Tag not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Tag not found"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:tag', TagController.resolve);

/**
 * @swagger
 * /api/tags/{tag}/transfer:
 *   put:
 *     summary: Transfer tag ownership
 *     description: Transfers a @tag to a new Stellar address.
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: Tag to transfer
 *         example: "johndoe"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newStellarAddress
 *             properties:
 *               newStellarAddress:
 *                 type: string
 *                 description: New Stellar public key
 *                 example: "GXYZ123..."
 *     responses:
 *       200:
 *         description: Tag transferred successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   $ref: '#/components/schemas/Tag'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/:tag/transfer', TagController.transfer);

export default router;
