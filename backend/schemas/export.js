import Joi from "joi";

/**
 * Schema for export request
 */
export const exportRequestSchema = Joi.object({
  format: Joi.string().valid("csv", "pdf").required().messages({
    "any.required": "Format is required",
    "any.only": "Format must be either csv or pdf",
  }),
  startDate: Joi.string().isoDate().allow(null, "").optional().messages({
    "string.isoDate": "Start date must be a valid ISO 8601 date",
  }),
  endDate: Joi.string().isoDate().allow(null, "").optional().messages({
    "string.isoDate": "End date must be a valid ISO 8601 date",
  }),
  type: Joi.string()
    .valid(
      "send",
      "receive",
      "swap",
      "payment",
      "account_merge",
      "credit",
      "debit",
      "transfer",
      "deposit",
      "withdrawal",
    )
    .allow(null, "")
    .optional()
    .messages({
      "any.only":
        "Type must be one of: send, receive, swap, payment, account_merge, credit, debit, transfer, deposit, withdrawal",
    }),
  status: Joi.string()
    .valid("pending", "completed", "failed", "processing")
    .allow(null, "")
    .optional()
    .messages({
      "any.only":
        "Status must be one of: pending, completed, failed, processing",
    }),
  tokenId: Joi.number().integer().positive().allow(null).optional().messages({
    "number.integer": "Token ID must be a whole number",
    "number.positive": "Token ID must be positive",
  }),
  minAmount: Joi.number().positive().allow(null).optional().messages({
    "number.positive": "Minimum amount must be positive",
  }),
  maxAmount: Joi.number().positive().allow(null).optional().messages({
    "number.positive": "Maximum amount must be positive",
  }),
}).custom((value, helpers) => {
  // Validate date range
  if (value.startDate && value.endDate) {
    const start = new Date(value.startDate);
    const end = new Date(value.endDate);
    if (start > end) {
      return helpers.message("Start date cannot be after end date");
    }
  }

  // Validate amount range
  if (
    value.minAmount !== null &&
    value.maxAmount !== null &&
    value.minAmount !== undefined &&
    value.maxAmount !== undefined &&
    value.minAmount > value.maxAmount
  ) {
    return helpers.message(
      "Minimum amount cannot be greater than maximum amount",
    );
  }

  return value;
});

/**
 * Schema for export status query
 */
export const exportStatusSchema = Joi.object({
  jobId: Joi.string().required().messages({
    "any.required": "Job ID is required",
    "string.empty": "Job ID cannot be empty",
  }),
});

/**
 * Schema for export download query
 */
export const exportDownloadSchema = Joi.object({
  fileName: Joi.string().required().messages({
    "any.required": "File name is required",
    "string.empty": "File name cannot be empty",
  }),
});
