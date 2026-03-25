import Joi from "joi";

/**
 * Reusable Joi field definitions for domain-specific types.
 * Import individual validators and compose them into schemas.
 */

// ─── Tags ─────────────────────────────────────────────────────────────────────

/**
 * User @tag: 3-20 alphanumeric + underscore (no @ prefix in stored value).
 */
export const tagField = () =>
  Joi.string()
    .min(3)
    .max(20)
    .pattern(/^[a-zA-Z0-9_]+$/)
    .messages({
      "string.min": "Tag must be at least 3 characters long",
      "string.max": "Tag must be at most 20 characters long",
      "string.pattern.base": "Tag may only contain letters, numbers, and underscores",
      "string.empty": "Tag cannot be empty",
    });

/**
 * Extended tag used during registration (allows up to 50 chars).
 */
export const registrationTagField = () =>
  Joi.string()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_]+$/)
    .messages({
      "string.min": "Tag must be at least 3 characters long",
      "string.max": "Tag must be at most 50 characters long",
      "string.pattern.base": "Tag may only contain letters, numbers, and underscores",
      "string.empty": "Tag cannot be empty",
    });

// ─── Amounts ──────────────────────────────────────────────────────────────────

/**
 * Positive monetary amount with up to 18 decimal places.
 * Suitable for crypto amounts.
 */
export const cryptoAmountField = () =>
  Joi.number()
    .positive()
    .precision(18)
    .messages({
      "number.positive": "Amount must be greater than 0",
      "number.base": "Amount must be a valid number",
      "number.precision": "Amount cannot have more than 18 decimal places",
    });

/**
 * Non-negative amount (allows 0) for balances/thresholds.
 */
export const nonNegativeAmountField = () =>
  Joi.number()
    .min(0)
    .messages({
      "number.min": "Amount cannot be negative",
      "number.base": "Amount must be a valid number",
    });

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Standard pagination limit: integer 1–100, default 20.
 */
export const paginationLimitField = () =>
  Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .messages({
      "number.min": "Limit must be at least 1",
      "number.max": "Limit cannot exceed 100",
      "number.integer": "Limit must be a whole number",
    });

/**
 * Standard pagination offset: non-negative integer, default 0.
 */
export const paginationOffsetField = () =>
  Joi.number()
    .integer()
    .min(0)
    .default(0)
    .messages({
      "number.min": "Offset cannot be negative",
      "number.integer": "Offset must be a whole number",
    });

// ─── IDs ──────────────────────────────────────────────────────────────────────

/**
 * Integer resource ID (URL param or body field).
 */
export const integerIdField = () =>
  Joi.number()
    .integer()
    .positive()
    .messages({
      "number.integer": "ID must be a whole number",
      "number.positive": "ID must be a positive number",
      "number.base": "ID must be a valid number",
    });

/**
 * URL param schema for routes using a numeric :id parameter.
 */
export const numericIdParamSchema = Joi.object({
  id: integerIdField()
    .required()
    .messages({
      "any.required": "Resource ID is required",
    }),
});

// ─── Dates ────────────────────────────────────────────────────────────────────

/**
 * ISO 8601 date string (optional, allows null/"").
 */
export const isoDateField = () =>
  Joi.string()
    .isoDate()
    .allow(null, "")
    .optional()
    .messages({
      "string.isoDate": "Date must be a valid ISO 8601 date (e.g. 2024-01-31)",
    });

/**
 * Custom validator: ensures startDate is not after endDate.
 * Apply via .custom(dateRangeValidator) on a Joi.object that has startDate and endDate fields.
 */
export const dateRangeValidator = (value, helpers) => {
  const { startDate, from, endDate, to } = value;
  const start = startDate || from;
  const end = endDate || to;

  if (start && end) {
    if (new Date(start) > new Date(end)) {
      return helpers.message("Start date cannot be after end date");
    }
  }
  return value;
};

// ─── Text ─────────────────────────────────────────────────────────────────────

/**
 * Trimmed, non-empty name field (first/last name, full name, etc.).
 */
export const nameField = (min = 2, max = 100) =>
  Joi.string()
    .trim()
    .min(min)
    .max(max)
    .messages({
      "string.min": `Name must be at least ${min} characters`,
      "string.max": `Name must be at most ${max} characters`,
      "string.empty": "Name cannot be empty",
    });

/**
 * URL field (URI-safe, allows null/"" for optional use).
 */
export const urlField = () =>
  Joi.string()
    .uri({ scheme: ["http", "https"] })
    .messages({
      "string.uri": "Must be a valid URL (http or https)",
    });

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Strong password: 8+ chars, requires uppercase, lowercase, digit, and special char.
 */
export const strongPasswordField = () =>
  Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.max": "Password cannot exceed 128 characters",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
      "string.empty": "Password cannot be empty",
      "any.required": "Password is required",
    });

/**
 * TOTP / backup code token: 6-32 alphanumeric chars.
 */
export const twoFactorTokenField = () =>
  Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9]{6,32}$/)
    .messages({
      "string.pattern.base": "Token must be 6-32 alphanumeric characters",
      "string.empty": "Token cannot be empty",
      "any.required": "Token is required",
    });

// ─── Asset / Token symbols ────────────────────────────────────────────────────

/**
 * Crypto asset symbol: 1-12 uppercase alphanumeric chars (e.g. BTC, XLM, USDC).
 */
export const assetSymbolField = () =>
  Joi.string()
    .uppercase()
    .max(12)
    .pattern(/^[A-Z0-9]{1,12}$/)
    .messages({
      "string.pattern.base": "Asset symbol must be 1-12 uppercase letters or digits (e.g. ETH, USDC)",
      "string.max": "Asset symbol cannot exceed 12 characters",
    });
