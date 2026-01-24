import PaymentService from "../services/PaymentService.js";
import {
  paymentSchema,
  verifyPaymentSchema,
  transactionHistorySchema,
  verifyTransactionSchema,
} from "../schemas/payment.js";

/**
 * POST /api/payments/initiate
 * Initiate a @tag-to-@tag payment
 */
export const initiatePayment = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request payload
    const { error, value } = paymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        status: "error",
        message: error.details[0].message,
      });
    }

    // Process payment
    const result = await PaymentService.processPayment({
      senderId: userId,
      recipientTag: value.recipientTag,
      amount: value.amount,
      asset: value.asset,
      memo: value.memo,
    });

    return res.status(201).json({
      status: "success",
      message: "Payment initiated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Payment initiation error:", error);

    // Handle specific error cases
    if (error.message.includes("not found")) {
      return res.status(404).json({
        status: "error",
        message: error.message,
      });
    }

    if (
      error.message.includes("Insufficient") ||
      error.message.includes("limit") ||
      error.message.includes("daily")
    ) {
      return res.status(400).json({
        status: "error",
        message: error.message,
      });
    }

    if (error.message.includes("Cannot send")) {
      return res.status(400).json({
        status: "error",
        message: error.message,
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Failed to initiate payment",
      details: error.message,
    });
  }
};

/**
 * POST /api/payments/verify
 * Verify payment details before processing (dry-run)
 */
export const verifyPayment = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request payload
    const { error, value } = verifyPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        status: "error",
        message: error.details[0].message,
      });
    }

    // Validate payment (dry-run, doesn't process)
    const validationResult = await PaymentService.validatePayment({
      senderId: userId,
      recipientTag: value.recipientTag,
      amount: value.amount,
      asset: value.asset,
      memo: value.memo,
    });

    // Calculate fees
    const feeCalculation = PaymentService.calculateFees(value.amount);

    return res.status(200).json({
      status: "success",
      message: "Payment verification successful",
      data: {
        valid: true,
        sender: {
          id: validationResult.sender.id,
          tag: validationResult.sender.tag,
          email: validationResult.sender.email,
        },
        recipient: {
          id: validationResult.recipient.id,
          tag: validationResult.recipient.tag,
          email: validationResult.recipient.email,
        },
        payment: {
          amount: value.amount,
          asset: value.asset,
          memo: value.memo,
        },
        fees: feeCalculation,
        total: (parseFloat(value.amount) + parseFloat(feeCalculation.totalFee)).toFixed(2),
        estimatedTime: "2-5 minutes",
      },
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        status: "error",
        message: error.message,
      });
    }

    if (
      error.message.includes("Insufficient") ||
      error.message.includes("limit") ||
      error.message.includes("daily")
    ) {
      return res.status(400).json({
        status: "error",
        message: error.message,
      });
    }

    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

/**
 * GET /api/payments/transaction/:reference
 * Get payment status by transaction reference
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    // Validate reference format
    if (!reference || !reference.startsWith("PAY-")) {
      return res.status(400).json({
        status: "error",
        message: "Invalid transaction reference format",
      });
    }

    const transaction = await PaymentService.verifyPayment(reference);

    // Authorize user can view this transaction
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized to view this transaction",
      });
    }

    return res.status(200).json({
      status: "success",
      data: transaction,
    });
  } catch (error) {
    console.error("Payment status check error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        status: "error",
        message: "Transaction not found",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve payment status",
    });
  }
};

/**
 * GET /api/payments/history
 * Get transaction history for authenticated user
 */
export const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate query parameters
    const { error, value } = transactionHistorySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        status: "error",
        message: error.details[0].message,
      });
    }

    const transactions = await PaymentService.getTransactionHistory(userId, {
      limit: value.limit,
      offset: value.offset,
      type: value.type || null,
      status: value.status || null,
    });

    return res.status(200).json({
      status: "success",
      data: transactions,
      pagination: {
        limit: value.limit,
        offset: value.offset,
        count: transactions.length,
      },
    });
  } catch (error) {
    console.error("Transaction history error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve transaction history",
      details: error.message,
    });
  }
};

/**
 * GET /api/payments/calculator
 * Calculate fees for a proposed payment (no processing)
 */
export const calculatePaymentFees = async (req, res) => {
  try {
    const { amount, asset = "xlm" } = req.query;

    if (!amount) {
      return res.status(400).json({
        status: "error",
        message: "Amount parameter is required",
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Amount must be a positive number",
      });
    }

    const fees = PaymentService.calculateFees(amountNum);

    return res.status(200).json({
      status: "success",
      data: {
        amount: amountNum,
        asset,
        ...fees,
      },
    });
  } catch (error) {
    console.error("Fee calculation error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to calculate fees",
      details: error.message,
    });
  }
};

/**
 * POST /api/payments/resolve-tag
 * Resolve a @tag to get recipient details (info only)
 */
export const resolveTag = async (req, res) => {
  try {
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({
        status: "error",
        message: "Tag parameter is required",
      });
    }

    const resolved = await PaymentService.resolveTag(tag);

    return res.status(200).json({
      status: "success",
      data: {
        tag: resolved.user.tag,
        email: resolved.user.email,
        stellarAddress: resolved.stellarAddress,
        exists: true,
      },
    });
  } catch (error) {
    console.error("Tag resolution error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        status: "error",
        message: error.message,
        data: {
          exists: false,
        },
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Failed to resolve tag",
      details: error.message,
    });
  }
};

/**
 * GET /api/payments/limits
 * Get payment limits for authenticated user
 */
export const getPaymentLimits = async (req, res) => {
  try {
    const userId = req.user.id;

    const dailySpent = await PaymentService.getDailySpent(userId);
    const dailyTransactionCount = await PaymentService.getDailyTransactionCount(userId);

    const PAYMENT_LIMITS = {
      minAmount: 1,
      maxAmount: 100000,
      dailyLimit: 1000000,
      maxTransactionsPerDay: 1000,
    };

    return res.status(200).json({
      status: "success",
      data: {
        limits: PAYMENT_LIMITS,
        usage: {
          dailySpent: parseFloat(dailySpent).toFixed(2),
          dailyRemaining: (PAYMENT_LIMITS.dailyLimit - dailySpent).toFixed(2),
          dailyTransactions: dailyTransactionCount,
          remainingTransactions: PAYMENT_LIMITS.maxTransactionsPerDay - dailyTransactionCount,
        },
      },
    });
  } catch (error) {
    console.error("Payment limits error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve payment limits",
      details: error.message,
    });
  }
};
