import Joi from "joi";
import { SUPPORTED_CHAINS } from "../validators/blockchainValidators.js";
import { assetSymbolField, nonNegativeAmountField } from "../validators/customValidators.js";

/**
 * Schema for creating a new balance entry.
 */
export const balanceCreateSchema = Joi.object({
  token: Joi.string()
    .trim()
    .required()
    .messages({
      "any.required": "Token is required",
      "string.empty": "Token cannot be empty",
    }),

  symbol: assetSymbolField()
    .required()
    .messages({
      "any.required": "Symbol is required",
      "string.empty": "Symbol cannot be empty",
    }),

  chain: Joi.string()
    .valid(...SUPPORTED_CHAINS)
    .required()
    .messages({
      "any.only": `Chain must be one of: ${SUPPORTED_CHAINS.join(", ")}`,
      "any.required": "Chain is required",
      "string.empty": "Chain cannot be empty",
    }),

  amount: nonNegativeAmountField().optional(),

  usd_value: nonNegativeAmountField()
    .optional()
    .messages({
      "number.min": "USD value cannot be negative",
      "number.base": "USD value must be a number",
    }),

  tag: Joi.string()
    .trim()
    .allow("", null)
    .optional(),

  address: Joi.string()
    .trim()
    .allow("", null)
    .optional(),

  auto_convert_threshold: nonNegativeAmountField()
    .allow(null)
    .optional()
    .messages({
      "number.min": "Auto-convert threshold cannot be negative",
      "number.base": "Auto-convert threshold must be a number",
    }),
});

/**
 * Schema for updating an existing balance (all fields optional).
 */
export const balanceUpdateSchema = Joi.object({
  amount: nonNegativeAmountField().optional(),
  usd_value: nonNegativeAmountField().optional(),
  address: Joi.string().trim().allow("", null).optional(),
  auto_convert_threshold: nonNegativeAmountField().allow(null).optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

/**
 * Alias used in existing route (kept for backwards compatibility).
 */
export const balanceSchema = balanceCreateSchema;

/**
 * Schema for updating balance settings.
 * Only allows updating user-configurable fields.
 */
export const balanceUpdateSchema = Joi.object({
  auto_convert_threshold: Joi.number()
    .min(0)
    .allow(null)
    .optional()
    .messages({
      "number.min": "Auto-convert threshold cannot be negative",
      "number.base": "Auto-convert threshold must be a number",
    }),
}).unknown(false).messages({
  "object.unknown": "Invalid field provided. Only auto_convert_threshold can be updated.",
});
