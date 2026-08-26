/**
 * Safe Crypto Amount Validation
 *
 * Enforces decimal-string format for amounts to prevent precision loss
 * with large values (1e16+). Validates token-specific decimal places
 * and maximum values, ensuring amounts convert safely to BigNumber.
 *
 * Issue: #493 — Define and Enforce Safe Crypto Amount Precision
 */

import BigNumber from "bignumber.js";

const TOKEN_CONFIG = {
  XLM: { decimals: 7, maxAmount: "922337203685.4775807" },
  STRK: { decimals: 18, maxAmount: "1000000000000000000" },
  LSK: { decimals: 18, maxAmount: "1000000000000000000" },
  BASE: { decimals: 18, maxAmount: "1000000000000000000" },
  FLOW: { decimals: 18, maxAmount: "1000000000000000000" },
  U2U: { decimals: 18, maxAmount: "1000000000000000000" },
  USDC: { decimals: 6, maxAmount: "1000000000000000000" },
  USDT: { decimals: 6, maxAmount: "1000000000000000000" },
};

/**
 * Validates amount as a decimal string with token-specific precision.
 * Rejects unsafe numeric JSON amounts with clear migration guidance.
 *
 * @param {string|number} amount - Amount value (should be string, not number)
 * @param {string} tokenSymbol - Token symbol (e.g., "XLM", "USDC")
 * @returns {Object} { valid: boolean, error?: string, valueBN?: BigNumber }
 */
export function validateAmount(amount, tokenSymbol) {
  // Reject unsafe numeric JSON amounts >= 1e16
  if (typeof amount === "number" && amount >= 1e16) {
    return {
      valid: false,
      error: `Amount must be a string to preserve precision for large values. ` +
        `Example: send "1000000000000000000" instead of 1e+18. ` +
        `See API documentation for decimal-string format.`,
    };
  }

  // Reject numeric amounts (even small ones should be strings for consistency)
  if (typeof amount === "number") {
    return {
      valid: false,
      error: `Amount must be a string, not a number. ` +
        `Example: "1000.50" instead of 1000.50. ` +
        `This ensures exact decimal precision regardless of value size.`,
    };
  }

  // Validate is string
  if (typeof amount !== "string") {
    return {
      valid: false,
      error: "Amount must be a string representing a decimal value.",
    };
  }

  // Validate decimal format
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    return {
      valid: false,
      error: `Amount must be a decimal string (digits with optional decimal point). ` +
        `Example: "1000.50" or "1000". Received: "${amount}"`,
    };
  }

  const tokenConfig = TOKEN_CONFIG[tokenSymbol];
  if (!tokenConfig) {
    return {
      valid: false,
      error: `Unsupported token: ${tokenSymbol}. Supported tokens: ${Object.keys(TOKEN_CONFIG).join(", ")}`,
    };
  }

  // Validate decimal places doesn't exceed token precision
  const parts = amount.split(".");
  const providedDecimalPlaces = parts[1]?.length || 0;

  if (providedDecimalPlaces > tokenConfig.decimals) {
    return {
      valid: false,
      error: `${tokenSymbol} supports maximum ${tokenConfig.decimals} decimal places. ` +
        `Received ${providedDecimalPlaces} decimal places in: "${amount}"`,
    };
  }

  // Validate amount doesn't exceed token maximum
  const valueBN = new BigNumber(amount);
  const maxBN = new BigNumber(tokenConfig.maxAmount);

  if (valueBN.isGreaterThan(maxBN)) {
    return {
      valid: false,
      error: `${tokenSymbol} amount cannot exceed ${tokenConfig.maxAmount}. ` +
        `Received: "${amount}"`,
    };
  }

  // Validate amount is positive
  if (valueBN.isLessThanOrEqualTo(0)) {
    return {
      valid: false,
      error: "Amount must be greater than 0.",
    };
  }

  return {
    valid: true,
    valueBN,
  };
}

/**
 * Joi custom validation method for safe decimal-string amounts.
 * Integrates with Joi schema validation pipeline.
 *
 * Usage in schema:
 *   amount: Joi.string()
 *     .required()
 *     .custom(amountJoiValidator("XLM"))
 *
 * @param {string} tokenSymbol - Token symbol for validation context
 * @returns {Function} Joi validator function
 */
export function amountJoiValidator(tokenSymbol) {
  return (value, helpers) => {
    const validation = validateAmount(value, tokenSymbol);

    if (!validation.valid) {
      return helpers.error("string.custom", { error: validation.error });
    }

    // Return the validated BigNumber-converted value for downstream use
    return validation.valueBN.toString();
  };
}

export default { validateAmount, amountJoiValidator };
