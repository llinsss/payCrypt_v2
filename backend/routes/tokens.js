import express from "express";
import {
  createToken,
  getTokens,
  getTokenById,
  updateToken,
  deleteToken,
} from "../controllers/tokenController.js";
import { authenticate } from "../middleware/auth.js";
import { publicCache } from "../middleware/cacheControl.js";
import validate from "../middleware/validate.js";
import { paginationSchema } from "../validators/paginationValidator.js";
import { createTokenSchema, updateTokenSchema } from "../validators/tokenSchemas.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tokens
 *   description: Crypto token management
 */

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Get all tokens
 *     tags: [Tokens]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: List of tokens
 *       422:
 *         description: Validation error (invalid page or limit)
 *   post:
 *     summary: Create a new token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - symbol
 *               - name
 *               - decimals
 *               - chain
 *             properties:
 *               symbol:
 *                 type: string
 *                 example: "USDC"
 *               name:
 *                 type: string
 *                 example: "USD Coin"
 *               decimals:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 36
 *                 example: 6
 *               contractAddress:
 *                 type: string
 *               chain:
 *                 type: string
 *                 enum: [starknet, base, flow, lisk, u2u, evm, stellar]
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               logoUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Token created
 *       422:
 *         description: Validation error (invalid or unknown fields)
 */
router.post("/", validate(createTokenSchema), createToken);
router.get("/", validate(paginationSchema, "query"), publicCache(3600), getTokens);

/**
 * @swagger
 * /api/tokens/{id}:
 *   get:
 *     summary: Get token by ID
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token details
 *       404:
 *         description: Token not found
 *   put:
 *     summary: Update token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token updated
 *       404:
 *         description: Token not found
 *       422:
 *         description: Validation error
 *   delete:
 *     summary: Delete token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token deleted
 *       404:
 *         description: Token not found
 */
router.get("/:id", getTokenById);
router.put("/:id", validate(updateTokenSchema), updateToken);
router.delete("/:id", deleteToken);

export default router;