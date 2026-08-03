import Joi from "joi";

const tokenIdentifier = Joi.string()
  .trim()
  .min(1)
  .max(128)
  .pattern(/^(0x[a-fA-F0-9]+|[A-Za-z0-9._:-]{1,64})$/)
  .messages({
    "string.pattern.base": "Token must be a symbol, numeric id, or blockchain token address",
  });

const positiveDecimal = Joi.alternatives()
  .try(
    Joi.number().positive(),
    Joi.string()
      .trim()
      .pattern(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
      .custom((value, helpers) => {
        if (Number(value) <= 0) {
          return helpers.error("number.positive");
        }
        return value;
      }),
  )
  .messages({
    "alternatives.match": "Amount must be a positive decimal number",
    "number.positive": "Amount must be greater than 0",
  });

const chainIdentifier = Joi.alternatives().try(
  Joi.number().integer().positive(),
  Joi.string().trim().min(1).max(80),
);

/**
 * POST /api/v1/swap
 *
 * Quote request:
 *   { fromToken, toToken, amount, chainId, slippageBps? }
 *
 * Confirm request:
 *   { action: "confirm", quoteId }
 */
export const swapRequestSchema = Joi.object({
  action: Joi.string().valid("quote", "confirm").default("quote"),

  quoteId: Joi.string()
    .guid({ version: ["uuidv4"] })
    .when("action", {
      is: "confirm",
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .messages({
      "string.guid": "quoteId must be a valid quote UUID",
      "any.required": "quoteId is required when confirming a swap",
    }),

  fromToken: tokenIdentifier.when("action", {
    is: "quote",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  toToken: tokenIdentifier.when("action", {
    is: "quote",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  amount: positiveDecimal.when("action", {
    is: "quote",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  chainId: chainIdentifier.when("action", {
    is: "quote",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  slippageBps: Joi.number().integer().min(0).max(5000).optional().messages({
    "number.min": "slippageBps cannot be negative",
    "number.max": "slippageBps cannot exceed 5000 (50%)",
  }),

  slippagePercent: Joi.number().min(0).max(50).optional().messages({
    "number.min": "slippagePercent cannot be negative",
    "number.max": "slippagePercent cannot exceed 50%",
  }),

  idempotencyKey: Joi.string().trim().max(255).allow(null, "").optional(),
})
  .custom((value, helpers) => {
    if (value.action === "quote" && value.fromToken && value.toToken) {
      const from = String(value.fromToken).trim().toLowerCase();
      const to = String(value.toToken).trim().toLowerCase();
      if (from === to) {
        return helpers.message("fromToken and toToken must be different");
      }
    }
    return value;
  })
  .unknown(false);

export default swapRequestSchema;
