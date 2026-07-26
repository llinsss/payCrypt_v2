import SwapService from "../services/SwapService.js";
import Chain from "../models/Chain.js";
import logger from "../utils/logger.js";

/**
 * POST /api/v1/swap/quote
 * Returns a swap quote without executing the trade (step 1 of two-step flow).
 */
export const getSwapQuote = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fromToken, toToken, amount, chainId, slippage } = req.body;

    const quote = await SwapService.getQuote({
      userId,
      fromToken,
      toToken,
      amount,
      chainId,
      slippage: slippage || 0.5,
    });

    return res.status(200).json({
      success: true,
      message: "Quote generated successfully",
      data: quote,
    });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to generate swap quote");

    const statusCode = error.message.includes("not found")
      ? 404
      : error.message.includes("Unsupported")
        ? 400
        : error.message.includes("valid price")
          ? 400
          : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/swap/confirm
 * Confirms and executes a swap using a previously obtained quote (step 2 of two-step flow).
 */
export const confirmSwap = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quoteId, fromToken, toToken, amount, chainId, minReceiveAmount } = req.body;

    const result = await SwapService.confirmSwap({
      userId,
      quoteId,
      fromToken,
      toToken,
      amount,
      chainId,
      minReceiveAmount,
    });

    return res.status(201).json({
      success: true,
      message: "Swap executed successfully",
      data: result,
    });
  } catch (error) {
    logger.error({ err: error.message }, "Swap confirmation failed");

    let statusCode = 400;
    if (error.message.includes("expired")) {
      statusCode = 410; // Gone
    } else if (error.message.includes("not found")) {
      statusCode = 404;
    } else if (error.message.includes("Insufficient")) {
      statusCode = 402; // Payment Required
    } else if (error.message.includes("does not belong")) {
      statusCode = 403;
    } else if (error.message.includes("does not match")) {
      statusCode = 409; // Conflict
    }

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/swap
 * Combined quote + confirm in a single request (convenience endpoint).
 * Returns a quote if confirm=false, executes the swap if confirm=true.
 */
export const executeSwap = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fromToken, toToken, amount, chainId, slippage, confirm = false } = req.body;

    if (confirm) {
      // Get quote and immediately confirm
      const quote = await SwapService.getQuote({
        userId,
        fromToken,
        toToken,
        amount,
        chainId,
        slippage: slippage || 0.5,
      });

      const result = await SwapService.confirmSwap({
        userId,
        quoteId: quote.quoteId,
        fromToken,
        toToken,
        amount,
        chainId,
      });

      return res.status(201).json({
        success: true,
        message: "Swap executed successfully",
        data: result,
      });
    } else {
      // Just return the quote
      const quote = await SwapService.getQuote({
        userId,
        fromToken,
        toToken,
        amount,
        chainId,
        slippage: slippage || 0.5,
      });

      return res.status(200).json({
        success: true,
        message: "Quote generated successfully",
        data: quote,
      });
    }
  } catch (error) {
    logger.error({ err: error.message }, "Swap operation failed");

    const statusCode = error.message.includes("not found")
      ? 404
      : error.message.includes("Unsupported")
        ? 400
        : error.message.includes("Insufficient")
          ? 402
          : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/swap/status/:swapId
 * Check the status of a swap.
 */
export const getSwapStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { swapId } = req.params;

    const status = await SwapService.getSwapStatus({ userId, swapId });

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to get swap status");
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/swap/tokens
 * Get list of supported tokens for swapping.
 */
export const getSupportedTokens = async (req, res) => {
  try {
    const tokens = await SwapService.getSupportedTokens();

    return res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to get supported tokens");
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/swap/chains
 * Get list of supported chains for swapping.
 */
export const getSupportedChains = async (req, res) => {
  try {
    // Get chain details from database filtered to supported chains
    const allChains = await Chain.getAll(100, 0);
    const supportedChains = allChains.filter((c) =>
      SwapService.SUPPORTED_CHAIN_IDS.includes(c.id)
    );

    // Fallback to basic IDs if database has no matching records
    if (supportedChains.length === 0) {
      return res.status(200).json({
        success: true,
        data: SwapService.SUPPORTED_CHAIN_IDS.map((id) => ({ chainId: id })),
      });
    }

    return res.status(200).json({
      success: true,
      data: supportedChains,
    });
  } catch (error) {
    logger.error({ err: error.message }, "Failed to get supported chains");
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
