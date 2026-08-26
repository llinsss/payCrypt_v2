import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.unstable_mockModule("../config/database.js", () => ({
  default: {
    select: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    first: jest.fn()
  }
}));

jest.unstable_mockModule("../services/PaymentService.js", () => ({
  default: {
    createPayment: jest.fn()
  }
}));

const db = (await import("../config/database.js")).default;
const { default: UssdService } = await import("../services/UssdService.js");

describe("UssdService", () => {
  beforeEach(() => {
    UssdService.sessions.clear();
    jest.clearAllMocks();
  });

  describe("Session begin", () => {
    it("should show main menu on empty input", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "");

      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Welcome to Tagged");
      expect(result.message).toContain("1. Send Money");
    });

    it("should create session on first request", () => {
      const session = UssdService.getOrCreateSession("session1", "+2348012345678");

      expect(session.id).toBe("session1");
      expect(session.phoneNumber).toBe("+2348012345678");
      expect(session.createdAt).toBeGreaterThan(0);
    });
  });

  describe("Session continue (multi-step flow)", () => {
    it("should prompt for recipient tag (step 1)", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1");

      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Enter recipient @tag");
    });

    it("should prompt for amount (step 2)", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john");

      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Enter amount");
    });

    it("should show confirmation (step 3)", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*5000");

      expect(result.continueSession).toBe(true);
      expect(result.message).toContain("Send 5000 NGN to @john");
      expect(result.message).toContain("1. Confirm");
    });

    it("should persist session data across steps", async () => {
      const session = UssdService.getOrCreateSession("session1", "+2348012345678");

      await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@alice");
      expect(session.recipientTag).toBe("@alice");

      await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@alice*1000");
      expect(session.amount).toBe(1000);
    });
  });

  describe("Session complete", () => {
    it("should confirm payment and end session", async () => {
      jest.spyOn(UssdService, "getUserByPhone").mockResolvedValue({ id: 1 });
      jest.spyOn(UssdService, "processSendMoney").mockResolvedValue({
        message: "END Payment successful!",
        continueSession: false
      });

      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*5000*1");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Payment successful");
    });

    it("should clear session after completion", async () => {
      const session = UssdService.getOrCreateSession("session1", "+2348012345678");
      UssdService.clearSession("session1");

      expect(UssdService.sessions.has("session1")).toBe(false);
    });

    it("should cancel transaction when user selects cancel", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*5000*2");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Transaction cancelled");
    });
  });

  describe("Session timeout", () => {
    it("should cleanup expired sessions", () => {
      const session = UssdService.getOrCreateSession("session1", "+2348012345678");
      session.createdAt = Date.now() - (10 * 60 * 1000);

      UssdService.cleanupExpiredSessions();

      expect(UssdService.sessions.has("session1")).toBe(false);
    });

    it("should keep active sessions", () => {
      const session = UssdService.getOrCreateSession("session1", "+2348012345678");
      session.createdAt = Date.now() - (2 * 60 * 1000);

      UssdService.cleanupExpiredSessions();

      expect(UssdService.sessions.has("session1")).toBe(true);
    });
  });

  describe("Invalid input handling", () => {
    it("should reject tag without @ prefix", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*john");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Tag must start with @");
    });

    it("should reject negative amount", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*-100");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Invalid amount");
    });

    it("should reject zero amount", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*0");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Invalid amount");
    });

    it("should reject non-numeric amount", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*abc");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Invalid amount");
    });

    it("should reject invalid menu option", async () => {
      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "9");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Invalid option");
    });
  });

  describe("Retry behavior after invalid input", () => {
    it("should allow retry after tag validation failure", async () => {
      const result1 = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*invalid");
      expect(result1.continueSession).toBe(false);

      const result2 = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@valid");
      expect(result2.continueSession).toBe(true);
      expect(result2.message).toContain("Enter amount");
    });

    it("should allow retry after amount validation failure", async () => {
      const result1 = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*-50");
      expect(result1.continueSession).toBe(false);

      const result2 = await UssdService.handleUssdRequest("session1", "+2348012345678", "1*@john*1000");
      expect(result2.continueSession).toBe(true);
    });

    it("should maintain session during invalid input sequences", async () => {
      const session1 = UssdService.getOrCreateSession("session1", "+2348012345678");

      await UssdService.handleUssdRequest("session1", "+2348012345678", "1*bad");
      const session2 = UssdService.getOrCreateSession("session1", "+2348012345678");

      expect(session1).toBe(session2);
    });
  });

  describe("External call mocking", () => {
    it("should mock getUserByPhone", async () => {
      const spy = jest.spyOn(UssdService, "getUserByPhone").mockResolvedValue({ id: 1, tag: "@alice" });

      const user = await UssdService.getUserByPhone("+2348012345678");

      expect(spy).toHaveBeenCalled();
      expect(user.id).toBe(1);
    });

    it("should mock database queries", async () => {
      jest.spyOn(UssdService, "getUserByPhone").mockResolvedValue({ id: 1 });
      jest.spyOn(db, "select").mockResolvedValue([
        { token_symbol: "USDC", amount: "100.50", chain_name: "Base" }
      ]);

      const result = await UssdService.handleUssdRequest("session1", "+2348012345678", "2");

      expect(result.continueSession).toBe(false);
      expect(result.message).toContain("Your Balances");
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
  });
});
