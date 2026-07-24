import Joi from "joi";

/**
 * Schema for swap quote request.
 * Returns a price quote before execution (step 1 of two-step swap).
 */
export const swapQuoteSchema = Joi.object({
  fromToken: Joi.string()
    .trim()
    .uppercase()
    .required()
    .messages({
      "any.required": "fromToken is required",
      "string.empty": "fromToken cannot be empty",
    }),
  toToken: Joi.string()
    .trim()
    .uppercase()
    .required()
    .messages({
      "any.required": "toToken is required",
      "string.empty": "toToken cannot be empty",
    }),
  amount: Joi.number()
    .positive()
    .required()
    .messages({
      "any.required": "amount is required",
      "number.positive": "amount must be a positive number",
      "number.base": "amount must be a number",
    }),
  chainId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      "any.required": "chainId is required",
      "number.integer": "chainId must be an integer",
      "number.positive": "chainId must be a positive integer",
    }),
  slippage: Joi.number()
    .min(0.01)
    .max(50)
    .default(0.5)
    .messages({
      "number.min": "slippage must be at least 0.01%",
      "number.max": "slippage must not exceed 50%",
    }),
}).custom((value, helpers) => {
  if (value.fromToken === value.toToken) {
    return helpers.error("any.invalid", { message: "fromToken and toToken must be different" });
  }
  return value;
}).messages({
  "any.invalid": "fromToken and toToken must be different",
});

/**
 * Schema for swap confirmation request (step 2 of two-step swap).
 * Executes the swap using a previously obtained quote.
 */
export const swapConfirmSchema = Joi.object({
  quoteId: Joi.string()
    .trim()
    .required()
    .messages({
      "any.required": "quoteId is required",
      "string.empty": "quoteId cannot be empty",
    }),
  fromToken: Joi.string()
    .trim()
    .uppercase()
    .required()
    .messages({
      "any.required": "fromToken is required",
    }),
  toToken: Joi.string()
    .trim()
    .uppercase()
    .required()
    .messages({
      "any.required": "toToken is required",
    }),
  amount: Joi.number()
    .positive()
    .required()
    .messages({
      "any.required": "amount is required",
      "number.positive": "amount must be a positive number",
    }),
  chainId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      "any.required": "chainId is required",
    }),
  minReceiveAmount: Joi.number()
    .positive()
    .optional()
    .messages({
      "number.positive": "minReceiveAmount must be a positive number",
    }),
});

/**
 * Schema for checking swap status.
 */
export const swapStatusSchema = Joi.object({
  swapId: Joi.string()
    .trim()
    .required()
    .messages({
      "any.required": "swapId is required",
    }),
});
