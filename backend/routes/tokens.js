import express from "express";
import {
  createToken,
  getTokens,
  getTokenById,
  updateToken,
  deleteToken,
} from "../controllers/tokenController.js";
const router = express.Router();

/**
 * @swagger
 * /api/tokens:
 *   post:
 *     summary: Create a new token
 *     description: Creates a new supported cryptocurrency token in the system
 *     tags: [Tokens]
 *     security: []
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
 *               decimals:
 *                 type: integer
 *                 example: 18
 *               contract_address:
 *                 type: string
 *                 example: "0xdac17f958d2ee523a2206206994597c13d831ec7"
 *               chain_id:
 *                 type: integer
 *                 example: 1
 *               logo:
 *                 type: string
 *                 example: "https://example.com/usdt-logo.png"
 *               price:
 *                 type: number
 *                 example: 1.0
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Token created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Token'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/", createToken);

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Get all supported tokens
 *     description: Retrieves a list of all supported cryptocurrency tokens with their current prices
 *     tags: [Tokens]
 *     security: []
 *     responses:
 *       200:
 *         description: List of supported tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Token'
 *             example:
 *               - id: 1
 *                 name: "Tether USD"
 *                 symbol: "USDT"
 *                 decimals: 18
 *                 price: 1.0
 *                 is_active: true
 *               - id: 2
 *                 name: "Ethereum"
 *                 symbol: "ETH"
 *                 decimals: 18
 *                 price: 45000.0
 *                 is_active: true
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", getTokens);

/**
 * @swagger
 * /api/tokens/{id}:
 *   get:
 *     summary: Get token by ID
 *     description: Retrieves a specific token by its ID
 *     tags: [Tokens]
 *     security: []
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
 *         description: Token not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", getTokenById);

/**
 * @swagger
 * /api/tokens/{id}:
 *   put:
 *     summary: Update a token
 *     description: Updates token information
 *     tags: [Tokens]
 *     security: []
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
 *               price:
 *                 type: number
 *               is_active:
 *                 type: boolean
 *           example:
 *             price: 1.01
 *             is_active: true
 *     responses:
 *       200:
 *         description: Token updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Token'
 *       400:
 *         description: Token not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", updateToken);

/**
 * @swagger
 * /api/tokens/{id}:
 *   delete:
 *     summary: Delete a token
 *     description: Deletes a token from the system
 *     tags: [Tokens]
 *     security: []
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
 *         description: Token not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", deleteToken);

export default router;
