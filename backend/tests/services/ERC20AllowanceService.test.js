import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import ERC20AllowanceService from "../../services/ERC20AllowanceService.js";
import db from "../../config/database.js";
import { ethers } from "ethers";

vi.mock("../../contracts/index.js");
vi.mock("../../config/database.js");

describe("ERC20AllowanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllowance", () => {
    it("should return allowance for a token", async () => {
      const mockProvider = {
        call: vi.fn(),
      };
      vi.doMock("../../contracts/index.js", () => ({
        getEvmProvider: () => mockProvider,
      }));

      const allowance = await ERC20AllowanceService.getAllowance(
        "base",
        "0x1234567890abcdef",
        "0xuser",
        "0xspender"
      );

      expect(typeof allowance).toBe("string");
    });

    it("should handle allowance check errors gracefully", async () => {
      const allowance = await ERC20AllowanceService.getAllowance(
        "base",
        "0xinvalid",
        "0xuser",
        "0xspender"
      );

      expect(allowance).toBe("0");
    });
  });

  describe("requiresApproval", () => {
    it("should return true when allowance is insufficient", async () => {
      vi.spyOn(ERC20AllowanceService, "getAllowance").mockResolvedValue("100");

      const result = await ERC20AllowanceService.requiresApproval(
        "base",
        "0xtoken",
        "0xuser",
        "0xspender",
        1000
      );

      expect(result).toBe(true);
    });

    it("should return false when allowance is sufficient", async () => {
      vi.spyOn(ERC20AllowanceService, "getAllowance").mockResolvedValue(
        ethers.MaxUint256.toString()
      );

      const result = await ERC20AllowanceService.requiresApproval(
        "base",
        "0xtoken",
        "0xuser",
        "0xspender",
        1000
      );

      expect(result).toBe(false);
    });
  });

  describe("getApprovalStatus", () => {
    it("should return approval status for a token", async () => {
      db.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1, symbol: "USDC" }),
      });

      vi.spyOn(ERC20AllowanceService, "getAllowance").mockResolvedValue("0");

      const status = await ERC20AllowanceService.getApprovalStatus(
        "0xuser",
        "base",
        1
      );

      expect(status).toBeDefined();
      expect(status.tokenId).toBe(1);
    });

    it("should return null if token not found", async () => {
      db.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      const status = await ERC20AllowanceService.getApprovalStatus(
        "0xuser",
        "base",
        999
      );

      expect(status).toBeNull();
    });
  });
});
