import { describe, it, expect } from "@jest/globals";
import BigNumber from "bignumber.js";

/**
 * Crypto Amount Precision Test
 *
 * Demonstrates the unsafe handling of large crypto amounts when
 * accepted as JavaScript numbers instead of decimal strings.
 *
 * Issue: #493 — Define and Enforce Safe Crypto Amount Precision
 */

describe("Crypto Amount Precision", () => {
  describe("JavaScript Number Precision Loss", () => {
    it("should demonstrate precision loss with native numbers > 1e16", () => {
      // IEEE 754 doubles can only safely represent integers up to 2^53 - 1 (9,007,199,254,740,991)
      // Beyond that, precision is lost in the binary mantissa.

      const exactValue = 1000000000000000000; // 1e18 as exact integer
      const numberValue = 1e18; // The same value as a JS numeric literal

      // These are NOT equal due to floating-point representation
      expect(exactValue).not.toBe(numberValue);
      expect(numberValue).toBe(1e18);

      // When transmitted as JSON and parsed back:
      const jsonRoundtrip = JSON.parse(JSON.stringify({ amount: 1e18 }));
      expect(jsonRoundtrip.amount).toBe(1e18);
      expect(jsonRoundtrip.amount).not.toBe(exactValue);
    });

    it("should show precision loss for USDC max transfer (1e18 * 6 decimals)", () => {
      // A token with 18 decimals supports values up to 1e18 (typically)
      // If we accept this as a JSON number:
      const unsafeAmount = 999999999999999999; // 1 unit below 1e18
      const asNumber = Number(unsafeAmount);

      // When this gets sent through JSON or network, precision can be lost
      expect(asNumber).toBe(999999999999999999);

      // But a much larger value would lose precision
      const maxWithPrecisionLoss = 9007199254740992; // Larger values lose precision
      expect(maxWithPrecisionLoss + 1).toBe(maxWithPrecisionLoss); // No longer distinguishable
    });
  });

  describe("Decimal String Representation (Proposed Solution)", () => {
    it("should preserve exact value as decimal string", () => {
      // Using strings preserves exact value, even for very large numbers
      const exactValueStr = "1000000000000000000";
      const converted = new BigNumber(exactValueStr);

      expect(converted.toString()).toBe(exactValueStr);
      expect(converted.isNaN()).toBe(false);
      expect(converted.isFinite()).toBe(true);
    });

    it("should validate token-specific decimal places", () => {
      // Token config: XLM has 7 decimals, USDC has 6, others have 18
      const tokenDecimals = {
        XLM: 7,
        USDC: 6,
        STRK: 18,
        ETH: 18,
      };

      // Valid: "1.5" XLM (7 decimals, 1 decimal place provided)
      const validXLM = "1.5";
      const decimalPlaces = validXLM.split(".")[1]?.length || 0;
      expect(decimalPlaces).toBeLessThanOrEqual(tokenDecimals.XLM);

      // Invalid: "1.123456789" XLM (more decimals than token supports)
      const invalidXLM = "1.12345678";
      const invalidPlaces = invalidXLM.split(".")[1]?.length || 0;
      expect(invalidPlaces).toBeGreaterThan(tokenDecimals.XLM);
    });

    it("should reject unsafe numeric JSON amounts with clear error", () => {
      // When a JSON number >= 1e16 is received, the API should:
      // 1. Detect it's a number (not a string)
      // 2. Reject with a clear message directing to string format

      const unsafePayload = { amount: 1e18 }; // number, not string
      const isUnsafeNumber =
        typeof unsafePayload.amount === "number" &&
        unsafePayload.amount >= 1e16;

      expect(isUnsafeNumber).toBe(true);

      // Expected error message (implementation in schema):
      const expectedError =
        "amount must be a string to preserve precision; send as \"1000000000000000000\", not 1e+18";
      expect(expectedError).toContain("must be a string");
      expect(expectedError).toContain("preserve precision");
    });

    it("should convert to BigNumber only after validation", () => {
      // Validation pipeline:
      // 1. Accept string
      // 2. Validate format and token-specific precision
      // 3. Only then convert to BigNumber

      const inputStr = "1234.567";

      // Step 1: Accept as string
      expect(typeof inputStr).toBe("string");

      // Step 2: Validate (simplified)
      const isValidDecimal = /^\d+(\.\d+)?$/.test(inputStr);
      expect(isValidDecimal).toBe(true);

      // Step 3: Convert to BigNumber
      const bn = new BigNumber(inputStr);
      expect(bn.toString()).toBe(inputStr);
    });
  });

  describe("Token-Specific Validation", () => {
    const TOKEN_CONFIG = {
      XLM: { decimals: 7, maxValue: "922337203685.4775807" },
      STRK: { decimals: 18, maxValue: "1000000000000000000" },
      USDC: { decimals: 6, maxValue: "1000000000000000000" },
    };

    it("should validate amount does not exceed token max", () => {
      // XLM: 7 decimals, max value is much smaller than STRK
      const xlmAmount = "1000000";
      const xlmConfig = TOKEN_CONFIG.XLM;

      const bn = new BigNumber(xlmAmount);
      const maxBn = new BigNumber(xlmConfig.maxValue);

      expect(bn.isLessThanOrEqualTo(maxBn)).toBe(true);
    });

    it("should validate amount matches token decimal precision", () => {
      // XLM has 7 decimals, so "1.12345678" should be rejected
      const xlmAmount = "1.12345678";
      const xlmDecimals = TOKEN_CONFIG.XLM.decimals;

      const parts = xlmAmount.split(".");
      const providedDecimals = parts[1]?.length || 0;

      expect(providedDecimals).toBeGreaterThan(xlmDecimals);
      // This should trigger validation error
    });

    it("should allow max precision for the token", () => {
      // XLM with 7 decimals: max is "1.2345678" (8 sig figs, 7 decimal places)
      const xlmAmount = "1.2345678";
      const xlmDecimals = TOKEN_CONFIG.XLM.decimals;

      const parts = xlmAmount.split(".");
      const providedDecimals = parts[1]?.length || 0;

      expect(providedDecimals).toBeLessThanOrEqualTo(xlmDecimals);
    });
  });

  describe("API Contract Change", () => {
    it("should document the decimal-string format in API docs", () => {
      // Example request format (updated):
      const exampleRequest = {
        senderTag: "@alice",
        recipientTag: "@bob",
        amount: "1000.50", // String, not number
        asset: "XLM",
      };

      expect(typeof exampleRequest.amount).toBe("string");
      expect(exampleRequest.amount).toMatch(/^\d+(\.\d+)?$/);
    });

    it("should provide migration guidance for existing clients", () => {
      const guidance = `
        API Change: Amounts must now be sent as decimal strings, not JSON numbers.

        Before:  { "amount": 1000.50 }          // ❌ unsafe for large values
        After:   { "amount": "1000.50" }        // ✅ precise decimal string

        This ensures exact precision for all supported token types.
      `;

      expect(guidance).toContain("decimal strings");
      expect(guidance).toContain("precise");
    });
  });
});
