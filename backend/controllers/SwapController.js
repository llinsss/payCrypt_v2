import SwapService from "../services/SwapService.js";

const statusForError = (error) => {
  if (error.status) return error.status;
  if (error.message?.toLowerCase().includes("insufficient")) return 422;
  if (error.message?.toLowerCase().includes("not found")) return 404;
  if (error.message?.toLowerCase().includes("expired")) return 410;
  if (error.message?.toLowerCase().includes("provider")) return 503;
  return 400;
};

export const handleSwap = async (req, res) => {
  try {
    const action = req.body.action || "quote";
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authenticated user is required",
      });
    }

    if (action === "confirm") {
      const result = await SwapService.confirmSwap({
        userId,
        quoteId: req.body.quoteId,
        idempotencyKey: req.body.idempotencyKey || req.get("Idempotency-Key") || null,
      });

      return res.status(200).json({
        success: true,
        step: "confirm",
        message: "Swap completed successfully",
        data: result,
      });
    }

    const quote = await SwapService.createQuote({
      userId,
      fromToken: req.body.fromToken,
      toToken: req.body.toToken,
      amount: req.body.amount,
      chainId: req.body.chainId,
      slippageBps: req.body.slippageBps,
      slippagePercent: req.body.slippagePercent,
    });

    return res.status(200).json({
      success: true,
      step: "quote",
      message: "Quote generated. Confirm with action=confirm and quoteId before it expires.",
      data: quote,
    });
  } catch (error) {
    const status = statusForError(error);
    return res.status(status).json({
      success: false,
      error: error.message,
      code: error.code || "SWAP_ERROR",
      ...(error.details && { details: error.details }),
    });
  }
};

export default {
  handleSwap,
};
