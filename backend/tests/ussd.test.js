import { describe, it, expect, beforeEach, jest } from "@jest/globals";

import db from "../config/database.js";
import UssdService from "../services/UssdService.js";

describe("UssdService", () => {
  beforeEach(() => {
    UssdService.sessions.clear();
  });

  describe("Main Menu", () => {
    it("should show main menu on empty input", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "");
      
      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Welcome to Tagged");
      expect(result.message).toContain("1. Send Money");
    });
  });

  describe("Send Money Flow", () => {
    it("should prompt for recipient tag", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1");
      
      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Enter recipient @tag");
    });

    it("should validate tag format", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*john");
      
      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Tag must start with @");
    });

    it("should prompt for amount", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john");
      
      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Enter amount");
    });

    it("should validate amount", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*-100");
      
      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Invalid amount");
    });

    it("should show confirmation", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*5000");
      
      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Send 5000 NGN to @john");
      expect(result.message).toContain("1. Confirm");
    });
  });

  describe("Check Balance", () => {
    it("should show user balances", async () => {
      // Mock user and balances
      jest.spyOn(UssdService, "getUserByPhone").mockResolvedValue({ id: 1 });
      jest.spyOn(db, "select").mockResolvedValue([
        { token_symbol: "USDC", amount: "100.50", chain_name: "Base" }
      ]);

      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "2");
      
      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Your Balances");
      expect(result.message).toContain("USDC: 100.50");
    });
  });

  describe("Session Management", () => {
    it("should create new session", () => {
      const session = UssdService.getOrCreateSession("session1", "+2348012345678");
      
      expect(session.id).toBe("session1");
      expect(session.phoneNumber).toBe("+2348012345678");
    });

    it("should reuse existing session", () => {
      const session1 = UssdService.getOrCreateSession("session1", "+2348012345678");
      const session2 = UssdService.getOrCreateSession("session1", "+2348012345678");
      
      expect(session1).toBe(session2);
    });

    it("should cleanup expired sessions", () => {
      const session = UssdService.getOrCreateSession("session1", "+2348012345678");
      session.createdAt = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      
      UssdService.cleanupExpiredSessions();
      
      expect(UssdService.sessions.has("session1")).toBe(false);
    });
  });
});
