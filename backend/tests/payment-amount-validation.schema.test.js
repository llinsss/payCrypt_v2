import { describe, it, expect } from "@jest/globals";
import {
  processPaymentSchema,
  batchPaymentSchema,
  paymentLimitsSchema,
} from "../schemas/payment.js";
import { validateAmount } from "../schemas/amountValidation.js";

/**
 * Payment Schema Amount Validation Tests
 *
 * Validates that payment schemas correctly enforce decimal-string
 * format for amounts and token-specific precision limits.
 *
 * Issue: #493 — Define and Enforce Safe Crypto Amount Precision
 */

describe("Payment Schema Amount Validation", () => {
  describe("processPaymentSchema", () => {
    it("should accept valid decimal string amount", () => {
      const validPayment = {
        senderTag: "alice",
        recipientTag: "bob",
        amount: "1000.50",
        asset: "XLM",
      };

      const { error } = processPaymentSchema.validate(validPayment);
      expect(error).toBeUndefined();
    });

    it("should accept integer string amount", () => {
      const validPayment = {
        senderTag: "alice",
        recipientTag: "bob",
        amount: "1000",
        asset: "XLM",
      };

      const { error } = processPaymentSchema.validate(validPayment);
      expect(error).toBeUndefined();
    });

    it("should reject numeric JSON amount", () => {
      const invalidPayment = {
        senderTag: "alice",
        recipientTag: "bob",
        amount: 1000.5, // number, not string
        asset: "XLM",
      };

      const { error } = processPaymentSchema.validate(invalidPayment);
      expect(error).toBeDefined();
      expect(error.message).toContain("string");
    });

    it("should reject unsafe large numeric amount (1e18)", () => {
      const invalidPayment = {
        senderTag: "alice",
        recipientTag: "bob",
        amount: 1e18, // unsafe number
        asset: "XLM",
      };

      const { error } = processPaymentSchema.validate(invalidPayment);
      expect(error).toBeDefined();
    });

    it("should reject amount with invalid format", () => {
      const invalidPayment = {
        senderTag: "alice",
        recipientTag: "bob",
        amount: "1000abc", // invalid format
        asset: "XLM",
      };

      const { error } = processPaymentSchema.validate(invalidPayment);
      expect(error).toBeDefined();
      expect(error.message).toContain("decimal string");
    });
  });

  describe("batchPaymentSchema", () => {
    it("should accept batch with valid decimal string amounts", () => {
      const validBatch = {
        senderTag: "alice",
        payments: [
          { recipientTag: "bob", amount: "100.5" },
          { recipientTag: "charlie", amount: "200.75" },
        ],
        asset: "XLM",
      };

      const { error } = batchPaymentSchema.validate(validBatch);
      expect(error).toBeUndefined();
    });

    it("should reject batch with numeric amounts", () => {
      const invalidBatch = {
        senderTag: "alice",
        payments: [{ recipientTag: "bob", amount: 100.5 }], // number
        asset: "XLM",
      };

      const { error } = batchPaymentSchema.validate(invalidBatch);
      expect(error).toBeDefined();
    });
  });

  describe("paymentLimitsSchema", () => {
    it("should accept decimal string limits", () => {
      const validLimits = {
        maxAmount: "1000000",
        minAmount: "0.01",
        baseFeePercentage: 0.5,
        minFee: "0.50",
      };

      const { error } = paymentLimitsSchema.validate(validLimits);
      expect(error).toBeUndefined();
    });

    it("should reject numeric amount limits", () => {
      const invalidLimits = {
        maxAmount: 1000000, // should be string
        minAmount: 0.01,
        baseFeePercentage: 0.5,
        minFee: 0.5,
      };

      const { error } = paymentLimitsSchema.validate(invalidLimits);
      expect(error).toBeDefined();
    });
  });

  describe("Token-Specific Amount Validation", () => {
    describe("XLM (7 decimal places)", () => {
      it("should accept max XLM precision", () => {
        const result = validateAmount("1.2345678", "XLM");
        expect(result.valid).toBe(true);
      });

      it("should reject XLM with too many decimal places", () => {
        const result = validateAmount("1.12345678", "XLM");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("7 decimal places");
      });

      it("should reject XLM amount exceeding max", () => {
        const result = validateAmount("922337203686", "XLM");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("cannot exceed");
      });
    });

    describe("STRK (18 decimal places)", () => {
      it("should accept STRK with 18 decimal places", () => {
        const result = validateAmount("1.123456789012345678", "STRK");
        expect(result.valid).toBe(true);
      });

      it("should reject STRK with 19+ decimal places", () => {
        const result = validateAmount("1.1234567890123456789", "STRK");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("18 decimal places");
      });

      it("should accept large STRK amount up to max", () => {
        const result = validateAmount("1000000000000000000", "STRK");
        expect(result.valid).toBe(true);
      });

      it("should reject STRK amount exceeding 1e18", () => {
        const result = validateAmount("10000000000000000000", "STRK");
        expect(result.valid).toBe(false);
      });
    });

    describe("USDC (6 decimal places)", () => {
      it("should accept USDC with 6 decimal places", () => {
        const result = validateAmount("100.123456", "USDC");
        expect(result.valid).toBe(true);
      });

      it("should reject USDC with 7+ decimal places", () => {
        const result = validateAmount("100.1234567", "USDC");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("6 decimal places");
      });
    });

    describe("Boundary Tests", () => {
      it("should accept exact max amount for token", () => {
        const result = validateAmount("1000000000000000000", "STRK");
        expect(result.valid).toBe(true);
      });

      it("should reject one unit over max for token", () => {
        const result = validateAmount("1000000000000000001", "STRK");
        expect(result.valid).toBe(false);
      });

      it("should reject zero and negative amounts", () => {
        expect(validateAmount("0", "XLM").valid).toBe(false);
        expect(validateAmount("-100", "XLM").valid).toBe(false);
        expect(validateAmount("0.00", "XLM").valid).toBe(false);
      });

      it("should accept very small positive amounts", () => {
        // XLM with 7 decimals: smallest meaningful is 0.0000001
        const result = validateAmount("0.0000001", "XLM");
        expect(result.valid).toBe(true);
      });
    });

    describe("Unsafe Numeric Amount Rejection", () => {
      it("should reject numeric amount >= 1e16", () => {
        const result = validateAmount(1e18, "XLM");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("string");
        expect(result.error).toContain("preserve precision");
      });

      it("should reject any numeric amount (even small)", () => {
        const result = validateAmount(100.5, "XLM");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("string");
      });

      it("should provide clear migration guidance", () => {
        const result = validateAmount(1000, "XLM");
        expect(result.error).toContain("Example:");
      });
    });

    describe("BigNumber Conversion", () => {
      it("should return BigNumber in valid result", () => {
        const result = validateAmount("1000.50", "XLM");
        expect(result.valid).toBe(true);
        expect(result.valueBN).toBeDefined();
        expect(result.valueBN.toString()).toBe("1000.5");
      });

      it("should preserve exact decimal value through BigNumber", () => {
        const inputStr = "123.456789";
        const result = validateAmount(inputStr, "STRK");
        expect(result.valueBN.toString()).toBe(inputStr);
      });
    });
  });
});
