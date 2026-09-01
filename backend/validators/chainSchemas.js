import Joi from "joi";
import { SUPPORTED_CHAINS } from "./blockchainValidators.js";

/**
 * Whitelisted fields for chain create/update operations (issues #562).
 *
 * createChainSchema  – all required fields must be present
 * updateChainSchema  – all fields optional (PATCH-style partial update)
 *
 * Both schemas strip unknown keys (stripUnknown) to prevent mass-assignment.
 */

/** Valid URL helper reused by both schemas. */
const rpcUrlField = () =>
  Joi.string()
    .uri({ scheme: ["http", "https", "wss", "ws"] })
    .max(512)
    .messages({
      "string.uri":   "rpcUrl must be a valid HTTP, HTTPS, WS or WSS URL",
      "string.max":   "rpcUrl must not exceed 512 characters",
    });

/**
 * chainId: a short, URL-safe identifier e.g. "xlm", "eth", "base-mainnet".
 * Lowercase letters, digits, and hyphens only; 1-64 characters.
 */
const chainIdField = () =>
  Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .min(1)
    .max(64)
    .messages({
      "string.pattern.base": 'chainId must contain only lowercase letters, digits, and hyphens (e.g. "eth", "base-mainnet")',
      "string.min":          "chainId must be at least 1 character",
      "string.max":          "chainId must not exceed 64 characters",
    });

export const createChainSchema = Joi.object({
  /** Human-readable name, e.g. "Ethereum Mainnet" */
  name: Joi.string().trim().min(1).max(100).required().messages({
    "any.required": "name is required",
    "string.empty": "name cannot be empty",
    "string.max":   "name must not exceed 100 characters",
  }),

  /** Short identifier used in URLs and references */
  chainId: chainIdField().required().messages({
    "any.required": "chainId is required",
  }),

  /** Optional JSON-RPC / Horizon endpoint */
  rpcUrl: rpcUrlField().optional(),

  /** Ticker symbol, e.g. "ETH", "XLM" */
  symbol: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9]{1,12}$/)
    .optional()
    .messages({
      "string.pattern.base": 'symbol must be 1-12 uppercase alphanumeric characters (e.g. "ETH")',
    }),

  /** Whether the chain is currently active */
  is_active: Joi.boolean().default(true),

  /**
   * Optional: which blockchain family this chain belongs to.
   * Must be one of the supported chain identifiers.
   */
  network: Joi.string()
    .valid(...SUPPORTED_CHAINS)
    .optional()
    .messages({
      "any.only": `network must be one of: ${SUPPORTED_CHAINS.join(", ")}`,
    }),
}).options({ stripUnknown: true });

export const updateChainSchema = Joi.object({
  name:      Joi.string().trim().min(1).max(100).optional(),
  chainId:   chainIdField().optional(),
  rpcUrl:    rpcUrlField().optional(),
  symbol:    Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{1,12}$/).optional(),
  is_active: Joi.boolean().optional(),
  network:   Joi.string().valid(...SUPPORTED_CHAINS).optional(),
})
  .min(1) // at least one field required for an update
  .options({ stripUnknown: true })
  .messages({
    "object.min": "At least one field must be provided for an update",
  });