import Joi from "joi";
import {
  paginationLimitField,
  paginationOffsetField,
  isoDateField,
  integerIdField,
  dateRangeValidator,
} from "../validators/customValidators.js";

/**
 * URL param schema for routes with a numeric :id.
 */
export const transactionIdParamSchema = Joi.object({
  id: integerIdField()
    .required()
    .messages({
      "any.required": "Transaction ID is required",
    }),
});

/**
 * URL param schema for routes with a :tag segment.
 */
export const transactionTagParamSchema = Joi.object({
  tag: Joi.string()
    .trim()
    .pattern(/^[a-zA-Z0-9_]{3,20}$/)
    .required()
    .messages({
      "string.pattern.base": "Tag must be 3-20 alphanumeric characters (underscores allowed)",
      "any.required": "Tag is required",
    }),
});

/**
 * Query parameter schema for listing transactions.
 */
export const transactionQuerySchema = Joi.object({
  limit: paginationLimitField(),
  offset: paginationOffsetField(),

  from: isoDateField().messages({
    "string.isoDate": "From date must be a valid ISO 8601 date",
  }),
  to: isoDateField().messages({
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

  sortOrder: Joi.string()
    .valid("asc", "desc")
    .default("desc")
    .messages({
      "any.only": "sortOrder must be asc or desc",
    }),

  noteSearch: Joi.string()
    .trim()
    .max(100)
    .allow(null, "")
    .optional()
    .messages({
      "string.max": "Note search term cannot exceed 100 characters",
    }),
}).custom(dateRangeValidator);

/**
 * Query parameter schema for searching transactions (extends base query with keyword).
 */
export const transactionSearchQuerySchema = Joi.object({
  q: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .messages({
      "string.min": "Search query cannot be empty",
      "string.max": "Search query cannot exceed 200 characters",
    }),

  limit: paginationLimitField(),
  offset: paginationOffsetField(),

  from: isoDateField(),
  to: isoDateField(),

  type: Joi.string()
    .valid("payment", "account_merge", "credit", "debit", "transfer", "deposit", "withdrawal")
    .allow(null, "")
    .optional()
    .messages({
      "any.only": "Type must be one of: payment, account_merge, credit, debit, transfer, deposit, withdrawal",
    }),

  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled")
    .allow(null, "")
    .optional()
    .messages({
      "any.only": "Status must be one of: pending, completed, failed, cancelled",
    }),

  sortBy: Joi.string()
    .valid("created_at", "amount", "usd_value", "type", "status")
    .default("created_at")
    .messages({
      "any.only": "sortBy must be one of: created_at, amount, usd_value, type, status",
    }),

  sortOrder: Joi.string()
    .valid("asc", "desc")
    .default("desc")
    .messages({
      "any.only": "sortOrder must be asc or desc",
    }),
}).custom(dateRangeValidator);

/**
 * Body schema for updating a transaction (all fields optional — partial update).
 */
export const transactionSchema = Joi.object({
  reference: Joi.string().trim().max(100).optional(),

  type: Joi.string()
    .valid("payment", "credit", "debit", "transfer", "deposit", "withdrawal")
    .optional()
    .messages({
      "any.only": "Type must be one of: payment, credit, debit, transfer, deposit, withdrawal",
    }),

  action: Joi.string().trim().max(50).allow(null, "").optional(),

  amount: Joi.number()
    .positive()
    .optional()
    .messages({
      "number.positive": "Amount must be greater than 0",
      "number.base": "Amount must be a number",
    }),

  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled")
    .optional()
    .messages({
      "any.only": "Status must be one of: pending, completed, failed, cancelled",
    }),

  hash: Joi.string().trim().allow(null, "").optional(),
  token: Joi.string().trim().allow(null, "").optional(),

  rate: Joi.number().min(0).allow(null).optional(),

  description: Joi.string().trim().max(500).allow(null, "").optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow(null, "")
    .optional()
    .messages({
      "string.max": "Notes cannot exceed 1000 characters",
    }),

  extra: Joi.object().allow(null).optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });
