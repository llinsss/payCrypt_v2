import express from "express";
import FeeService from "../services/FeeService.js";
import { authenticate } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Fees
 *   description: Fee calculation and fee structure queries
 */

/**
 * @swagger
 * /api/fees:
 *   get:
 *     summary: Calculate fees for a withdrawal
 *     description: Calculate the fee breakdown for a bank, crypto, or tag withdrawal based on the type, chain, token, and amount.
 *     tags: [Fees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [bank, crypto, tag]
 *         description: Withdrawal type
 *       - in: query
 *         name: chain
 *         required: true
 *         schema:
 *           type: string
 *         description: Blockchain chain (e.g., base, xlm, lisk, flow, u2u, starknet)
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token symbol (e.g., USDC, USDT, XLM)
 *       - in: query
 *         name: amount
 *         required: true
 *         schema:
 *           type: number
 *         description: Withdrawal amount
 *     responses:
 *       200:
 *         description: Fee breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 platformFee:
 *                   type: number
 *                   example: 50.0
 *                   description: Platform fee in the withdrawal currency
 *                 networkFee:
 *                   type: number
 *                   example: 0.01
 *                   description: Blockchain network fee
 *                 totalFee:
 *                   type: number
 *                   example: 50.01
 *                 feePercentage:
 *                   type: number
 *                   example: 0.5
 *                   description: Fee as percentage of withdrawal amount
 *                 withdrawalAmount:
 *                   type: number
 *                   example: 10000
 *                 netAmount:
 *                   type: number
 *                   example: 9949.99
 *       400:
 *         description: Missing or invalid parameters
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const { type, chain, token, amount } = req.query;

    // Validate required parameters
    if (!type || !chain || !token || !amount) {
      return res.status(400).json({
        error: "Missing required parameters",
        required: ["type", "chain", "token", "amount"],
      });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        error: "Amount must be a positive number",
      });
    }

    const fees = await FeeService.getFeesAsync(type, chain, token, numAmount);

    logger.info({
      msg: "Fee calculation requested",
      userId: req.user?.id,
      type,
      chain,
      token,
      amount: numAmount,
    });

    res.status(200).json(fees);
  } catch (error) {
    logger.error({
      msg: "Fee calculation error",
      userId: req.user?.id,
      error: error.message,
    });

    if (error.message.includes("Invalid type")) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to calculate fees" });
  }
});

/**
 * @swagger
 * /api/fees/structures:
 *   get:
 *     summary: List all available fee structures
 *     description: Returns all configured fee structures for each withdrawal type, chain, and token combination.
 *     tags: [Fees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fee structures
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
 *                       type:
 *                         type: string
 *                         example: "bank"
 *                       chain:
 *                         type: string
 *                         example: "base"
 *                       token:
 *                         type: string
 *                         example: "USDC"
 *                       baseFeePercentage:
 *                         type: number
 *                         example: 0.5
 *                       minFee:
 *                         type: number
 *                         example: 50
 *                       maxAmount:
 *                         type: number
 *                       minAmount:
 *                         type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/structures", authenticate, async (req, res) => {
  try {
    const structures = await FeeService.listFeeStructures();
    res.status(200).json(structures);
  } catch (error) {
    logger.error({
      msg: "Error fetching fee structures",
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch fee structures" });
  }
});

export default router;
