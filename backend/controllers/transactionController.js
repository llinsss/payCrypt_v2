import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import PaymentService from "../services/PaymentService.js";
import ReceiptService from "../services/ReceiptService.js";
import { processPaymentSchema, transactionHistoryQuerySchema } from "../schemas/payment.js";

export const createTransaction = async (req, res) => {
  try {
    const transactionData = {
      ...req.body,
      user_id: req.user.id,
    };

    const transaction = await Transaction.create(transactionData);
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, metadataSearch = null, noteSearch = null, min_amount, max_amount } = req.query;

    const parsedLimit = Number.parseInt(limit);
    const parsedPage = Number.parseInt(page);
    const offset = (parsedPage - 1) * parsedLimit;

    // Validate amount range parameters
    let minAmount = null;
    let maxAmount = null;

    if (min_amount !== undefined) {
      minAmount = parseFloat(min_amount);
      if (isNaN(minAmount) || minAmount < 0) {
        return res.status(400).json({ error: "Invalid min_amount. Must be a positive number." });
      }
    }

    if (max_amount !== undefined) {
      maxAmount = parseFloat(max_amount);
      if (isNaN(maxAmount) || maxAmount < 0) {
        return res.status(400).json({ error: "Invalid max_amount. Must be a positive number." });
      }
    }

    if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
      return res.status(400).json({ error: "min_amount cannot be greater than max_amount." });
    }

    const transactions = await Transaction.getAll(
      parsedLimit,
      offset,
      metadataSearch,
      { minAmount, maxAmount, noteSearch }
    );

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionByUser = async (req, res) => {
  try {
    const { id } = req.user;
    const { min_amount, max_amount, noteSearch } = req.query;

    // Validate amount range parameters
    let minAmount = null;
    let maxAmount = null;

    if (min_amount !== undefined) {
      minAmount = parseFloat(min_amount);
      if (isNaN(minAmount) || minAmount < 0) {
        return res.status(400).json({ error: "Invalid min_amount. Must be a positive number." });
      }
    }

    if (max_amount !== undefined) {
      maxAmount = parseFloat(max_amount);
      if (isNaN(maxAmount) || maxAmount < 0) {
        return res.status(400).json({ error: "Invalid max_amount. Must be a positive number." });
      }
    }

    if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
      return res.status(400).json({ error: "min_amount cannot be greater than max_amount." });
    }

    const transactions = await Transaction.getByUser(id, 10, 0, { minAmount, maxAmount, noteSearch });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(400).json({ error: "Transaction not found" });
    }
    // Only allow ttransaction owner to view
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (transaction.status !== "completed") {
      return res.status(400).json({ error: "Receipt only available for completed transactions" });
    }

    const pdfBuffer = await ReceiptService.generateReceipt(transaction);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${transaction.id}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Receipt generation failed:", error);
    return res.status(500).json({ error: "Failed to generate receipt" });
  }
};

export const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(400).json({ error: "Transaction not found" });
    }

    // Only allow transaction owner to update
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedTransaction = await Transaction.update(id, req.body);
    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTransactionNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Only allow transaction owner to update
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedTransaction = await Transaction.update(id, { notes });
    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(400).json({ error: "Transaction not found" });
    }

    // Only allow transaction owner to delete
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Transaction.delete(id);
    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const restoreTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    
    const transaction = await Transaction.findByIdWithDeleted(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Only allow transaction owner to restore
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (transaction.deleted_at === null) {
      return res.status(400).json({ error: "Transaction is not deleted" });
    }

    await Transaction.restore(id);
    const restoredTransaction = await Transaction.findById(id);
    res.json(restoredTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionsByTag = async (req, res) => {
  try {
    const { tag } = req.params;
    const {
      limit = 20,
      offset = 0,
      from,
      to,
      type,
      min_amount,
      max_amount,
      noteSearch,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    const user = await User.findByTag(tag);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Validate amount range parameters
    let minAmount = null;
    let maxAmount = null;

    if (min_amount !== undefined) {
      minAmount = parseFloat(min_amount);
      if (isNaN(minAmount) || minAmount < 0) {
        return res.status(400).json({ error: "Invalid min_amount. Must be a positive number." });
      }
    }

    if (max_amount !== undefined) {
      maxAmount = parseFloat(max_amount);
      if (isNaN(maxAmount) || maxAmount < 0) {
        return res.status(400).json({ error: "Invalid max_amount. Must be a positive number." });
      }
    }

    if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
      return res.status(400).json({ error: "min_amount cannot be greater than max_amount." });
    }

    const parsedLimit = Math.min(Math.max(Number.parseInt(limit) || 20, 1), 100);
    const parsedOffset = Math.max(Number.parseInt(offset) || 0, 0);

    const options = {
      limit: parsedLimit,
      offset: parsedOffset,
      from: from || null,
      to: to || null,
      type: type || null,
      minAmount,
      maxAmount,
      noteSearch,
      sortBy,
      sortOrder,
    };

    const [transactions, total] = await Promise.all([
      Transaction.getByTag(user.id, options),
      Transaction.countByTag(user.id, options),
    ]);

    res.json({
      data: transactions,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + transactions.length < total,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Process @tag-to-@tag payment with comprehensive validation
 * POST /api/transactions/payment
 * Body: { senderTag, recipientTag, amount, asset, assetIssuer, memo, senderSecret, additionalSecrets }
 */
export const processPayment = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = processPaymentSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message
        }))
      });
    }

    const { senderTag, recipientTag, amount, asset = 'XLM', assetIssuer, memo, senderSecret, additionalSecrets = [], idempotencyKey } = value;
    const userId = req.user.id;
    const idempotencyKeyFromHeader = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

    // Combine secrets
    const secrets = [senderSecret, ...additionalSecrets];

    // Process the payment
    const result = await PaymentService.processPayment({
      senderTag,
      recipientTag,
      amount,
      asset,
      assetIssuer,
      memo,
      notes,
      secrets,
      userId,
      idempotencyKey: idempotencyKey || idempotencyKeyFromHeader || null
    });

    res.status(201).json({
      success: true,
      message: 'Payment processed successfully',
      data: result
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    
    // Determine appropriate HTTP status code
    let statusCode = 400;
    if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('Insufficient funds')) {
      statusCode = 402; // Payment Required
    } else if (error.message.includes('network')) {
      statusCode = 503; // Service Unavailable
    }

    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get payment limits and configuration
 * GET /api/transactions/payment/limits
 */
export const getPaymentLimits = async (req, res) => {
  try {
    const limits = PaymentService.getPaymentLimits();
    res.json({
      success: true,
      data: limits
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get transaction history for a @tag
 * GET /api/transactions/tag/:tag/history
 */
export const getPaymentHistory = async (req, res) => {
  try {
    const { tag } = req.params;
    const { error, value } = transactionHistoryQuerySchema.validate(req.query);

    if (error) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.message
      });
    }

    const transactions = await PaymentService.getTransactionHistory(tag, value);

    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
