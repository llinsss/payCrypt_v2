import Joi from "joi";

/**
 * Schema for creating a new balance entry.
 */
export const balanceCreateSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      "any.required": "Token is required",
      "string.empty": "Token cannot be empty",
    }),

  symbol: Joi.string()
    .uppercase()
    .max(12)
    .required()
    .messages({
      "string.max": "Symbol must be at most 12 characters",
      "any.required": "Symbol is required",
      "string.empty": "Symbol cannot be empty",
    }),

  chain: Joi.string()
    .required()
    .messages({
      "any.required": "Chain is required",
      "string.empty": "Chain cannot be empty",
    }),

  amount: Joi.number()
    .min(0)
    .optional()
    .messages({
      "number.min": "Amount cannot be negative",
      "number.base": "Amount must be a number",
    }),

  usd_value: Joi.number().min(0).optional().messages({
    "number.min": "USD value cannot be negative",
    "number.base": "USD value must be a number",
  }),

  tag: Joi.string().allow("", null).optional(),

  address: Joi.string().allow("", null).optional(),

  auto_convert_threshold: Joi.number()
    .min(0)
    .allow(null)
    .optional()
    .messages({
      "number.min": "Auto-convert threshold cannot be negative",
      "number.base": "Auto-convert threshold must be a number",
    }),
});

/**
 * Alias used in existing route (kept for backwards compatibility).
 */
export const balanceSchema = balanceCreateSchema;
