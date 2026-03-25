import Joi from "joi";
import { cryptoAmountField, integerIdField } from "../validators/customValidators.js";
import { genericBlockchainAddress } from "../validators/blockchainValidators.js";

/**
 * Schema for sending funds to another user via their @tag.
 */
export const sendToTagSchema = Joi.object({
  receiver_tag: Joi.string()
    .trim()
    .pattern(/^[a-zA-Z0-9_]{3,20}$/)
    .required()
    .messages({
      "string.pattern.base": "Receiver tag must be 3-20 alphanumeric characters (underscores allowed)",
      "any.required": "Receiver tag is required",
      "string.empty": "Receiver tag cannot be empty",
    }),

  amount: cryptoAmountField()
    .required()
    .messages({
      "any.required": "Amount is required",
    }),

  balance_id: integerIdField()
    .required()
    .messages({
      "any.required": "Balance ID is required",
    }),
});

/**
 * Schema for sending funds to an external blockchain wallet address.
 */
export const sendToWalletSchema = Joi.object({
  receiver_address: genericBlockchainAddress()
    .required()
    .messages({
      "any.required": "Receiver address is required",
      "string.empty": "Receiver address cannot be empty",
    }),

  amount: cryptoAmountField()
    .required()
    .messages({
      "any.required": "Amount is required",
    }),

  balance_id: integerIdField()
    .required()
    .messages({
      "any.required": "Balance ID is required",
    }),
});

/**
 * Schema for updating wallet settings.
 * Note: auto_convert_threshold is a balance-level setting, not wallet-level.
 * This schema currently has no fields but is defined for future wallet updates.
 */
export const updateWalletSchema = Joi.object({
    // Wallet table only has: available_balance, locked_balance (managed by system)
    // No user-updatable fields currently exist on the wallet table
}).unknown(false).messages({
    "object.unknown": "Invalid field provided. Wallets have no user-updatable fields.",
});
 * Schema for updating wallet metadata (name, notes, etc.).
 * All fields are optional; at least one must be provided.
 */
export const walletUpdateSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .messages({
      "string.min": "Wallet name cannot be empty",
      "string.max": "Wallet name cannot exceed 100 characters",
    }),

  notes: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .optional()
    .messages({
      "string.max": "Notes cannot exceed 500 characters",
    }),

  is_default: Joi.boolean()
    .optional()
    .messages({
      "boolean.base": "is_default must be true or false",
    }),

  label: Joi.string()
    .trim()
    .max(50)
    .allow("", null)
    .optional()
    .messages({
      "string.max": "Label cannot exceed 50 characters",
    }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });
