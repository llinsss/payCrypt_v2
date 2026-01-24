import Joi from "joi";

/**
 * Schema for initiating a payment
 */
export const paymentSchema = Joi.object({
  recipientTag: Joi.string()
    .pattern(/^@?[a-zA-Z0-9_]{3,20}$/)
    .required()
    .messages({
      "string.pattern.base":
        "Tag must be alphanumeric with underscores, 3-20 characters (with or without @)",
      "any.required": "Recipient tag is required",
    }),
  amount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      "number.positive": "Amount must be greater than 0",
      "any.required": "Amount is required",
    }),
  asset: Joi.string()
    .valid("xlm", "usdc", "bnx", "usdt")
    .default("xlm")
    .messages({
      "any.only": "Asset must be one of: xlm, usdc, bnx, usdt",
    }),
  memo: Joi.string()
    .max(28)
    .optional()
    .allow(null, "")
    .messages({
      "string.max": "Memo must be 28 characters or less",
    }),
});

/**
 * Schema for verifying payment before processing
 */
export const verifyPaymentSchema = Joi.object({
  recipientTag: Joi.string()
    .pattern(/^@?[a-zA-Z0-9_]{3,20}$/)
    .required(),
  amount: Joi.number().positive().precision(2).required(),
  asset: Joi.string().valid("xlm", "usdc", "bnx", "usdt").default("xlm"),
  memo: Joi.string().max(28).optional().allow(null, ""),
});

/**
 * Schema for transaction history query
 */
export const transactionHistorySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  type: Joi.string()
    .valid("credit", "debit", "payment", "payment_received", null)
    .allow(null, ""),
  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled", null)
    .allow(null, ""),
});

/**
 * Schema for verifying existing payment
 */
export const verifyTransactionSchema = Joi.object({
  reference: Joi.string()
    .pattern(/^PAY-/)
    .required()
    .messages({
      "string.pattern.base": "Invalid transaction reference format",
    }),
});
