import Joi from "joi";

/**
 * Query parameter schema for listing transactions.
 */
export const transactionQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
    "number.integer": "Limit must be a whole number",
  }),
  offset: Joi.number().integer().min(0).default(0).messages({
    "number.min": "Offset cannot be negative",
    "number.integer": "Offset must be a whole number",
  }),
  from: Joi.string().isoDate().allow(null, "").optional().messages({
    "string.isoDate": "From date must be a valid ISO 8601 date",
  }),
  to: Joi.string().isoDate().allow(null, "").optional().messages({
    "string.isoDate": "To date must be a valid ISO 8601 date",
  }),
  type: Joi.string()
    .valid("payment", "account_merge", "credit", "debit", "transfer", "deposit", "withdrawal")
    .allow(null, "")
    .optional()
    .messages({
      "any.only": "Type must be one of: payment, account_merge, credit, debit, transfer, deposit, withdrawal",
    }),
  sortBy: Joi.string()
    .valid("created_at", "amount", "usd_value", "type", "status")
    .default("created_at")
    .messages({
      "any.only": "sortBy must be one of: created_at, amount, usd_value, type, status",
    }),
  sortOrder: Joi.string().valid("asc", "desc").default("desc").messages({
    "any.only": "sortOrder must be asc or desc",
  }),
  noteSearch: Joi.string().max(100).optional().allow(null, "").messages({
    "string.max": "Note search term cannot exceed 100 characters",
  }),
});

/**
 * Body schema for updating a transaction (all fields optional — partial update).
 */
export const transactionSchema = Joi.object({
  reference: Joi.string().max(100).optional(),

  type: Joi.string()
    .valid("payment", "credit", "debit", "transfer", "deposit", "withdrawal")
    .optional()
    .messages({
      "any.only": "Type must be one of: payment, credit, debit, transfer, deposit, withdrawal",
    }),

  action: Joi.string().max(50).allow(null, "").optional(),

  amount: Joi.number().positive().optional().messages({
    "number.positive": "Amount must be greater than 0",
    "number.base": "Amount must be a number",
  }),

  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled")
    .optional()
    .messages({
      "any.only": "Status must be one of: pending, completed, failed, cancelled",
    }),

  hash: Joi.string().allow(null, "").optional(),
  token: Joi.string().allow(null, "").optional(),

  rate: Joi.number().min(0).allow(null).optional(),

  description: Joi.string().max(500).allow(null, "").optional(),

  notes: Joi.string().max(1000).allow(null, "").optional().messages({
    "string.max": "Notes cannot exceed 1000 characters",
  }),

  extra: Joi.object().allow(null).optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });
