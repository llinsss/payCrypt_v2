import BatchPaymentService from "../services/BatchPaymentService.js";

export const createBatchPayment = async (req, res) => {
  try {
    const {
      senderTag,
      payments,
      atomic = true,
      asset = "XLM",
      assetIssuer = null,
      memo = null,
      senderSecret,
      additionalSecrets = [],
    } = req.body;

    const result = await BatchPaymentService.createBatchPayment({
      userId: req.user.id,
      senderTag,
      payments,
      atomic,
      asset,
      assetIssuer,
      memo,
      senderSecret,
      additionalSecrets,
    });

    return res.status(result.httpStatus).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error("Batch payment processing error:", error);

    const statusCode = error.message.includes("not found")
      ? 404
      : error.message.includes("network")
        ? 503
        : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};

export const getBatchPaymentStatus = async (req, res) => {
  try {
    const batch = await BatchPaymentService.getBatchStatus({
      batchId: req.params.id,
      userId: req.user.id,
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: "Batch payment not found",
      });
    }

    return res.json({
      success: true,
      data: batch,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
