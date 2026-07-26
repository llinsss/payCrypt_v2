import express from "express";
import {
  getSwapQuote,
  confirmSwap,
  executeSwap,
  getSwapStatus,
  getSupportedTokens,
  getSupportedChains,
} from "../controllers/swapController.js";
import { authenticate, userRateLimiter } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { swapQuoteSchema, swapConfirmSchema } from "../schemas/swap.js";
import { rateLimit } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * @swagger
 * /api/v1/swap/tokens:
 *   get:
 *     summary: Get supported tokens for swapping
 *     tags: [Swap]
 *     responses:
 *       200:
 *         description: List of supported tokens
 */
router.get("/tokens", getSupportedTokens);

/**
 * @swagger
 * /api/v1/swap/chains:
 *   get:
 *     summary: Get supported chains for swapping
 *     tags: [Swap]
 *     responses:
 *       200:
 *         description: List of supported chains
 */
router.get("/chains", getSupportedChains);

/**
 * @swagger
 * /api/v1/swap/status/{swapId}:
 *   get:
 *     summary: Get the status of a swap
 *     tags: [Swap]
 *     parameters:
 *       - in: path
 *         name: swapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Swap status
 */
router.get("/status/:swapId", authenticate, rateLimit({ endpointName: "swap" }), getSwapStatus);

/**
 * @swagger
 * /api/v1/swap/quote:
 *   post:
 *     summary: Get a swap quote (step 1)
 *     tags: [Swap]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromToken, toToken, amount, chainId]
 *             properties:
 *               fromToken:
 *                 type: string
 *               toToken:
 *                 type: string
 *               amount:
 *                 type: number
 *               chainId:
 *                 type: integer
 *               slippage:
 *                 type: number
 *     responses:
 *       200:
 *         description: Quote generated
 */
router.post(
  "/quote",
  authenticate,
  userRateLimiter,
  rateLimit({ endpointName: "swap", windowMs: 60 * 1000, max: 30 }),
  validate(swapQuoteSchema),
  getSwapQuote
);

/**
 * @swagger
 * /api/v1/swap/confirm:
 *   post:
 *     summary: Confirm and execute a swap (step 2)
 *     tags: [Swap]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quoteId, fromToken, toToken, amount, chainId]
 *             properties:
 *               quoteId:
 *                 type: string
 *               fromToken:
 *                 type: string
 *               toToken:
 *                 type: string
 *               amount:
 *                 type: number
 *               chainId:
 *                 type: integer
 *               minReceiveAmount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Swap executed
 */
router.post(
  "/confirm",
  authenticate,
  userRateLimiter,
  rateLimit({ endpointName: "swap", windowMs: 60 * 1000, max: 10 }),
  validate(swapConfirmSchema),
  confirmSwap
);

/**
 * @swagger
 * /api/v1/swap:
 *   post:
 *     summary: Execute a swap (combined quote + confirm)
 *     tags: [Swap]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromToken, toToken, amount, chainId]
 *             properties:
 *               fromToken:
 *                 type: string
 *               toToken:
 *                 type: string
 *               amount:
 *                 type: number
 *               chainId:
 *                 type: integer
 *               slippage:
 *                 type: number
 *               confirm:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Quote generated (if confirm=false)
 *       201:
 *         description: Swap executed (if confirm=true)
 */
router.post(
  "/",
  authenticate,
  userRateLimiter,
  rateLimit({ endpointName: "swap", windowMs: 60 * 1000, max: 20 }),
  validate(swapQuoteSchema),
  executeSwap
);

export default router;
