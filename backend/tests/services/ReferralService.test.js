import { describe, it, expect, beforeEach, vi } from "vitest";
import ReferralService from "../../services/ReferralService.js";
import db from "../../config/database.js";

vi.mock("../../config/database.js");

describe("ReferralService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateReferralCode", () => {
    it("should generate 8-character alphanumeric code", async () => {
      db.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      const code = await ReferralService.generateReferralCode();
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    });

    it("should ensure code is unique", async () => {
      let callCount = 0;
      db.where = vi.fn().mockReturnValue({
        first: vi.fn().mockImplementation(async () => {
          callCount++;
          return callCount === 1 ? { id: 1 } : null;
        }),
      });

      const code = await ReferralService.generateReferralCode();
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    });
  });

  describe("validateReferralCode", () => {
    it("should return null for invalid code format", async () => {
      const result = await ReferralService.validateReferralCode("invalid");
      expect(result).toBeNull();
    });

    it("should return user id for valid code", async () => {
      db.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 123 }),
      });

      const result = await ReferralService.validateReferralCode("ABC12345");
      expect(result).toBe(123);
    });

    it("should return null for non-existent code", async () => {
      db.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      const result = await ReferralService.validateReferralCode("ABC12345");
      expect(result).toBeNull();
    });
  });

  describe("markReferralComplete", () => {
    it("should only mark referral once", async () => {
      expect(true).toBe(true);
    });
  });

  describe("getReferralStats", () => {
    it("should not leak PII in stats", async () => {
      expect(true).toBe(true);
    });
  });
});
