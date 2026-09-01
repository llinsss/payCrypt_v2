import express from "express";

import { handleSwap } from "../controllers/SwapController.js";
import { authenticateJwtOrApiKey } from "../middleware/auth.js";
import { requireApiKeyScope } from "../middleware/apiKeyAuth.js";
import { auditLog } from "../middleware/audit.js";
import { rateLimit } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validation.js";
import { swapRequestSchema } from "../schemas/swap.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Swap
 *   description: Token swap quotes and confirmations
 */

/**
 * @swagger
 * /api/v1/swap:
 *   post:
 *     summary: Quote or confirm a token swap
 *     tags: [Swap]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [fromToken, toToken, amount, chainId]
 *                 properties:
 *                   fromToken: { type: string, example: STRK }
 *                   toToken: { type: string, example: USDC }
 *                   amount: { type: string, example: "1.5" }
 *                   chainId: { type: string, example: starknet }
 *                   slippageBps: { type: integer, example: 50 }
 *               - type: object
 *                 required: [action, quoteId]
 *                 properties:
 *                   action: { type: string, enum: [confirm] }
 *                   quoteId: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Quote generated or swap confirmed
 */
router.post(
  "/",
  authenticateJwtOrApiKey,
  rateLimit({ endpointName: "swap", windowMs: 60 * 1000, max: 60 }),
  validate(swapRequestSchema),
  auditLog("swaps"),
  requireApiKeyScope(["swaps:write", "transactions:write"]),
  handleSwap,
);

export default router;
