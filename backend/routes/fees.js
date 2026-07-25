import express from "express";
import FeeService from "../services/FeeService.js";
import { authenticate } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * GET /api/v1/fees
 * Get fee breakdown for a withdrawal
 *
 * Query parameters:
 *   type (required) - Withdrawal type: 'bank', 'crypto', 'tag'
 *   chain (required) - Blockchain chain: 'base', 'xlm', etc.
 *   token (required) - Token symbol: 'USDC', 'USDT', etc.
 *   amount (required) - Withdrawal amount as a number
 *
 * Example: GET /api/v1/fees?type=bank&chain=base&token=USDC&amount=100
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
 * GET /api/v1/fees/structures
 * Get all available fee structures
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
