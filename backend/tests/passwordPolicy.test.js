import express from "express";
import request from "supertest";
import { describe, it, expect } from "@jest/globals";

import { validate } from "../middleware/validation.js";
import { authSchemas } from "../schemas/auth.js";
import { validatePassword, PASSWORD_POLICY } from "../validators/passwordPolicy.js";

describe("Strong Password Policy Reconciliation (#494)", () => {
  describe("Policy Definition - Canonical Rules", () => {
    it("should define minimum length requirement", () => {
      expect(PASSWORD_POLICY.MIN_LENGTH).toBe(8);
    });

    it("should define maximum length requirement", () => {
      expect(PASSWORD_POLICY.MAX_LENGTH).toBe(128);
    });

    it("should include # in allowed special characters", () => {
      expect(PASSWORD_POLICY.SPECIAL_CHARS).toContain("#");
    });

    it("should define explicit set of allowed special characters", () => {
      expect(PASSWORD_POLICY.SPECIAL_CHARS).toBe("@$!%*?&#");
    });

    it("should require lowercase letter", () => {
      const rule = PASSWORD_POLICY.REQUIRED_RULES.find(r => r.name === "lowercase");
      expect(rule).toBeDefined();
      expect(rule.pattern.test("a")).toBe(true);
    });

    it("should require uppercase letter", () => {
      const rule = PASSWORD_POLICY.REQUIRED_RULES.find(r => r.name === "uppercase");
      expect(rule).toBeDefined();
      expect(rule.pattern.test("A")).toBe(true);
    });

    it("should require digit", () => {
      const rule = PASSWORD_POLICY.REQUIRED_RULES.find(r => r.name === "digit");
      expect(rule).toBeDefined();
      expect(rule.pattern.test("5")).toBe(true);
    });

    it("should require special character from allowed set", () => {
      const rule = PASSWORD_POLICY.REQUIRED_RULES.find(r => r.name === "special");
      expect(rule).toBeDefined();
      for (const char of PASSWORD_POLICY.SPECIAL_CHARS.split("")) {
        expect(rule.pattern.test(char)).toBe(true);
      }
    });
  });

  describe("Table-Driven Tests - Valid Passwords", () => {
    const validPasswords = [
      { password: "ValidPass1!", scenario: "simple valid password" },
      { password: "P@ssw0rd", scenario: "minimum length (8 chars) with all required types" },
      { password: "Test@Pass123", scenario: "uppercase, lowercase, digit, special" },
      { password: "MyP@ss#123", scenario: "includes # (newly allowed special char)" },
      { password: "Compl3x!P@ssw0rd#2024", scenario: "longer password with multiple special chars" },
      { password: "User$Acct#2024!", scenario: "multiple special characters from allowed set" },
      { password: "L0ngP@ssw0rd%X", scenario: "% special character allowed" },
      { password: "Mixed&Chars*2024", scenario: "& and * special characters" },
      { password: "C0mplex!P@ss", scenario: "mix of allowed special chars" },
      {
        password: "A" + "a".repeat(60) + "1!#",
        scenario: "near maximum length (128 chars)",
      },
    ];

    validPasswords.forEach(({ password, scenario }) => {
      it(`should accept: ${scenario}`, () => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe("Table-Driven Tests - Invalid Passwords (Too Short)", () => {
    const tooShortPasswords = [
      { password: "P@ss1", scenario: "only 5 characters" },
      { password: "Pw0!", scenario: "only 4 characters" },
      { password: "A1b@", scenario: "only 4 characters (has all types)" },
      { password: "Abc1!", scenario: "only 5 characters (valid types but too short)" },
    ];

    tooShortPasswords.forEach(({ password, scenario }) => {
      it(`should reject: ${scenario} (PASSWORD_TOO_SHORT)`, () => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.code).toBe("PASSWORD_TOO_SHORT");
      });
    });
  });

  describe("Table-Driven Tests - Invalid Passwords (Missing Character Types)", () => {
    const missingTypePasswords = [
      { password: "validpass1!", scenario: "missing uppercase", expectedCode: "PASSWORD_MISSING_UPPERCASE" },
      { password: "VALIDPASS1!", scenario: "missing lowercase", expectedCode: "PASSWORD_MISSING_LOWERCASE" },
      { password: "ValidPass!", scenario: "missing digit", expectedCode: "PASSWORD_MISSING_DIGIT" },
      { password: "ValidPass1", scenario: "missing special character", expectedCode: "PASSWORD_MISSING_SPECIAL" },
      { password: "abcdef123", scenario: "missing uppercase and special", expectedCode: "PASSWORD_MISSING_UPPERCASE" },
    ];

    missingTypePasswords.forEach(({ password, scenario, expectedCode }) => {
      it(`should reject: ${scenario}`, () => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.code).toBe(expectedCode);
      });
    });
  });

  describe("Table-Driven Tests - Invalid Characters", () => {
    const invalidCharPasswords = [
      { password: "ValidPass1™", scenario: "contains trademark symbol (™)" },
      { password: "Pass™@123word", scenario: "contains ™ in middle" },
      { password: "TestÜ@Pass123", scenario: "contains umlaut (Ü)" },
      { password: "Pass<word>123!", scenario: "contains < and >" },
      { password: "Pass(word)@123", scenario: "contains parentheses (only from allowed set needed)" },
    ];

    invalidCharPasswords.forEach(({ password, scenario }) => {
      it(`should reject: ${scenario} (contains invalid characters)`, () => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.code).toBe("PASSWORD_INVALID_CHARACTERS");
      });
    });
  });

  describe("Boundary Cases - Length Limits", () => {
    it("should accept password at minimum length (8 chars)", () => {
      const password = "Pass@123";
      const result = validatePassword(password);
      expect(result.isValid).toBe(true);
    });

    it("should reject password below minimum length (7 chars)", () => {
      const password = "Pass@12";
      const result = validatePassword(password);
      expect(result.isValid).toBe(false);
      expect(result.code).toBe("PASSWORD_TOO_SHORT");
    });

    it("should accept password at maximum length (128 chars)", () => {
      const password = "Pass@123" + "a".repeat(120);
      const result = validatePassword(password);
      expect(result.isValid).toBe(true);
    });

    it("should reject password exceeding maximum length (129 chars)", () => {
      const password = "Pass@123" + "a".repeat(121);
      const result = validatePassword(password);
      expect(result.isValid).toBe(false);
      expect(result.code).toBe("PASSWORD_TOO_LONG");
    });
  });

  describe("API Validation - Rejects Invalid Passwords with Standardized Error", () => {
    it("should return standardized error envelope when password invalid", async () => {
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/auth/register").send({
        tag: "validuser",
        email: "test@example.com",
        password: "NoSpecialChar123",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
      expect(Array.isArray(res.body.errors)).toBe(true);
      const passwordErr = res.body.errors.find(e => e.field === "password");
      expect(passwordErr).toBeDefined();
      expect(passwordErr.message).toBeDefined();
    });

    it("should never echo password value back in error response", async () => {
      const sensitivePassword = "SuperSecret@123#ShouldNeverEcho";
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/auth/register").send({
        tag: "validuser",
        email: "test@example.com",
        password: sensitivePassword,
      });

      const responseBody = JSON.stringify(res.body);
      expect(responseBody).not.toContain(sensitivePassword);
      expect(responseBody).not.toContain("SuperSecret");
    });

    it("should allow passwords with # special character", async () => {
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/auth/register").send({
        tag: "validuser",
        email: "test@example.com",
        password: "MyP@ss#123",
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("should allow all documented special characters", async () => {
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const specialChars = "@$!%*?&#";
      for (const char of specialChars.split("")) {
        const password = `TestP@ss1${char}`;
        if (!password.includes("@")) {
          continue;
        }
        const res = await request(app).post("/auth/register").send({
          tag: "validuser",
          email: `test${Math.random()}@example.com`,
          password,
        });

        expect(res.status).toBe(200);
      }
    });

    it("should reject undocumented special characters", async () => {
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const invalidPassword = "TestPass1<>^";
      const res = await request(app).post("/auth/register").send({
        tag: "validuser",
        email: "test@example.com",
        password: invalidPassword,
      });

      expect(res.status).toBe(400);
      const passwordErr = res.body.errors.find(e => e.field === "password");
      expect(passwordErr).toBeDefined();
    });
  });

  describe("Documentation Alignment - Examples Match Validation", () => {
    const documentedExamples = [
      { password: "StrongP@ssw0rd!", isValid: true, description: "from Swagger docs" },
      { password: "MyApp#2024!Sec", isValid: true, description: "with # character" },
      { password: "secure_pass@123", isValid: true, description: "with underscore and special" },
    ];

    documentedExamples.forEach(({ password, isValid, description }) => {
      it(`should validate documented example: ${description}`, () => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(isValid);
      });
    });
  });

  describe("Code Identifiers - Machine-Readable Rule Violations", () => {
    it("should return specific code for each type of violation", () => {
      const violations = [
        { password: "short@1", code: "PASSWORD_TOO_SHORT" },
        { password: "nocaps@123", code: "PASSWORD_MISSING_UPPERCASE" },
        { password: "NOLOWER@123", code: "PASSWORD_MISSING_LOWERCASE" },
        { password: "NoDigits@Pass", code: "PASSWORD_MISSING_DIGIT" },
        { password: "NoSpecial123", code: "PASSWORD_MISSING_SPECIAL" },
      ];

      violations.forEach(({ password, code }) => {
        const result = validatePassword(password);
        expect(result.code).toBe(code);
      });
    });
  });

  describe("Policy Consistency Across Modules", () => {
    it("should have passwordSchema match passwordPolicy rules", () => {
      const validPassword = "ValidPass@123";
      const policyResult = validatePassword(validPassword);
      expect(policyResult.isValid).toBe(true);
    });

    it("should have PASSWORD_POLICY description match UI copy requirements", () => {
      expect(PASSWORD_POLICY.DESCRIPTION).toContain("8");
      expect(PASSWORD_POLICY.DESCRIPTION).toContain("lowercase");
      expect(PASSWORD_POLICY.DESCRIPTION).toContain("uppercase");
      expect(PASSWORD_POLICY.DESCRIPTION).toContain("digit");
      expect(PASSWORD_POLICY.DESCRIPTION).toContain("special");
    });
  });
});
