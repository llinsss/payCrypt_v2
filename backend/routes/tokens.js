import express from "express";
import {
  createToken,
  getTokens,
  getTokenById,
  updateToken,
  deleteToken,
} from "../controllers/tokenController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();

/**
 * @swagger
 * /api/tokens:
 *   post:
 *     summary: Create a new token
 *     description: Registers a new supported token on the platform.
 *     tags: [Tokens]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - symbol
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Tether USD"
 *               symbol:
 *                 type: string
 *                 example: "USDT"
 *               contract_address:
 *                 type: string
 *                 example: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
 *               chain_id:
 *                 type: integer
 *                 example: 1
 *               decimals:
 *                 type: integer
 *                 example: 6
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Token created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Token'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/", createToken);

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Get all tokens
 *     description: Retrieves the list of all supported tokens on the platform.
 *     tags: [Tokens]
 *     responses:
 *       200:
 *         description: List of tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Token'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", getTokens);

/**
 * @swagger
 * /api/tokens/{id}:
 *   get:
 *     summary: Get token by ID
 *     description: Retrieves a specific token by its ID.
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Token ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Token details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Token'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", getTokenById);

/**
 * @swagger
 * /api/tokens/{id}:
 *   put:
 *     summary: Update a token
 *     description: Updates token configuration.
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Token ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               symbol:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Token updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Token'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", updateToken);

/**
 * @swagger
 * /api/tokens/{id}:
 *   delete:
 *     summary: Delete a token
 *     description: Removes a token from the platform.
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Token ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Token deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Token deleted successfully"
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", deleteToken);

export default router;
