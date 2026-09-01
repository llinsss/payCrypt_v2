import Joi from "joi";
import { SUPPORTED_CHAINS } from "./blockchainValidators.js";

/**
 * Whitelisted fields for token create/update operations (issue #563).
 *
 * createTokenSchema  – all required fields must be present
 * updateTokenSchema  – all fields optional (PATCH-style partial update)
 *
 * Both schemas strip unknown keys (stripUnknown) to prevent mass-assignment.
 */

/**
 * decimals: ERC-20 / fungible-token decimal places.
 * 0 = non-divisible token, 18 = typical EVM token.
 */
const decimalsField = () =>
  Joi.number()
    .integer()
    .min(0)
    .max(36)
    .messages({
      "number.base":    "decimals must be a number",
      "number.integer": "decimals must be an integer",
      "number.min":     "decimals must be at least 0",
      "number.max":     "decimals must not exceed 36",
    });

/**
 * Contract address: generic hex or Stellar/Lisk format.
 * A permissive check — detailed per-chain validation happens in
 * blockchainValidators when a chain context is available.
 */
const contractAddressField = () =>
  Joi.string()
    .max(128)
    .pattern(/^(0x[0-9a-fA-F]{1,64}|G[A-Z2-7]{55}|lsk[a-z2-7]{38})$/)
    .messages({
      "string.pattern.base": "contractAddress must be a valid EVM (0x…), Stellar (G…), or Lisk (lsk…) address",
      "string.max":          "contractAddress must not exceed 128 characters",
    });

export const createTokenSchema = Joi.object({
  /** Ticker symbol, e.g. "USDC", "ETH" */
  symbol: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9]{1,20}$/)
    .required()
    .messages({
      "any.required":        "symbol is required",
      "string.empty":        "symbol cannot be empty",
      "string.pattern.base": 'symbol must be 1-20 uppercase alphanumeric characters (e.g. "USDC")',
    }),

  /** Human-readable token name, e.g. "USD Coin" */
  name: Joi.string().trim().min(1).max(100).required().messages({
    "any.required": "name is required",
    "string.empty": "name cannot be empty",
    "string.max":   "name must not exceed 100 characters",
  }),

  /** Decimal precision */
  decimals: decimalsField().required().messages({
    "any.required": "decimals is required",
  }),

  /**
   * On-chain contract / issuer address.
   * Required for most tokens; mark optional for native assets (ETH, XLM).
   */
  contractAddress: contractAddressField().optional(),

  /**
   * Chain this token belongs to — must be a supported network identifier.
   */
  chain: Joi.string()
    .valid(...SUPPORTED_CHAINS)
    .required()
    .messages({
      "any.required": "chain is required",
      "any.only":     `chain must be one of: ${SUPPORTED_CHAINS.join(", ")}`,
    }),

  /** Whether the token is currently active / tradeable */
  is_active: Joi.boolean().default(true),

  /** Optional logo / icon URL */
  logoUrl: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .max(512)
    .optional()
    .messages({
      "string.uri": "logoUrl must be a valid HTTP or HTTPS URL",
      "string.max": "logoUrl must not exceed 512 characters",
    }),
}).options({ stripUnknown: true });

export const updateTokenSchema = Joi.object({
  symbol:          Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{1,20}$/).optional(),
  name:            Joi.string().trim().min(1).max(100).optional(),
  decimals:        decimalsField().optional(),
  contractAddress: contractAddressField().optional(),
  chain:           Joi.string().valid(...SUPPORTED_CHAINS).optional(),
  is_active:       Joi.boolean().optional(),
  logoUrl:         Joi.string().uri({ scheme: ["http", "https"] }).max(512).optional(),
})
  .min(1) // at least one field required for an update
  .options({ stripUnknown: true })
  .messages({
    "object.min": "At least one field must be provided for an update",
  });