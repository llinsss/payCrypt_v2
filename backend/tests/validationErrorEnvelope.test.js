import express from "express";
import request from "supertest";
import { describe, it, expect } from "@jest/globals";

import { validate, validateQuery, validateParams } from "../middleware/validation.js";
import { authSchemas } from "../schemas/auth.js";
import { batchPaymentSchema, processPaymentSchema } from "../schemas/payment.js";
import { editProfileSchema } from "../schemas/user.js";
import Joi from "joi";

describe("Validation Error Response Envelope (#495)", () => {
  describe("Standardized Error Response Shape", () => {
    it("should return consistent { error, message, errors[] } envelope", async () => {
      const app = express();
      app.use(express.json());
      app.post("/test", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/test").send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("errors");
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("should use machine-readable error code in each error object", async () => {
      const app = express();
      app.use(express.json());
      app.post("/test", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/test").send({});

      expect(res.body.errors.length).toBeGreaterThan(0);
      for (const err of res.body.errors) {
        expect(err).toHaveProperty("field");
        expect(err).toHaveProperty("code");
        expect(err).toHaveProperty("message");
        expect(typeof err.code).toBe("string");
      }
    });

    it("should have descriptive human-readable messages", async () => {
      const app = express();
      app.use(express.json());
      app.post("/test", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/test").send({ email: "invalid" });

      const emailErr = res.body.errors.find(e => e.field === "email");
      expect(emailErr).toBeDefined();
      expect(emailErr.message.length).toBeGreaterThan(0);
      expect(emailErr.code).toBe("INVALID_EMAIL");
    });

    it("should never echo back sensitive values (passwords, secrets)", async () => {
      const app = express();
      app.use(express.json());
      app.post("/test", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const sensitivePassword = "SuperSecret@123#$%^&*()";
      const res = await request(app).post("/test").send({
        tag: "test",
        email: "test@example.com",
        password: sensitivePassword,
      });

      const responseBody = JSON.stringify(res.body);
      expect(responseBody).not.toContain(sensitivePassword);
    });
  });

  describe("Auth Endpoint - Consistent Error Format", () => {
    it("should return standardized error for register validation failure", async () => {
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/auth/register").send({
        tag: "validtag",
        email: "not-an-email",
        password: "short",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
      expect(res.body.message).toContain("validation");
      expect(Array.isArray(res.body.errors)).toBe(true);

      const errors = res.body.errors;
      expect(errors.some(e => e.field === "email")).toBe(true);
      expect(errors.some(e => e.field === "password")).toBe(true);
      expect(errors.every(e => e.code && e.message)).toBe(true);
    });

    it("should identify specific validation rule violations", async () => {
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/auth/register").send({
        tag: "a",
        email: "test@example.com",
        password: "ValidP@ss1",
      });

      const tagErr = res.body.errors.find(e => e.field === "tag");
      expect(tagErr).toBeDefined();
      expect(tagErr.code).toBe("VALUE_TOO_SHORT");
    });

    it("should report all errors at once, not just first error", async () => {
      const app = express();
      app.use(express.json());
      app.post("/auth/register", validate(authSchemas.register), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/auth/register").send({});

      expect(res.body.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Query Validation - Consistent Error Format", () => {
    it("should return standardized error for query validation failure", async () => {
      const querySchema = Joi.object({
        page: Joi.number().integer().min(1).required(),
        limit: Joi.number().integer().min(1).max(100),
      });

      const app = express();
      app.use(express.json());
      app.get("/items", validateQuery(querySchema), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).get("/items").query({ page: "not-a-number", limit: 200 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
      expect(res.body.message).toContain("Query");
      expect(Array.isArray(res.body.errors)).toBe(true);

      const errors = res.body.errors;
      expect(errors.some(e => e.field === "page")).toBe(true);
      expect(errors.some(e => e.field === "limit")).toBe(true);
      expect(errors.every(e => e.code && e.message)).toBe(true);
    });
  });

  describe("Params Validation - Consistent Error Format", () => {
    it("should return standardized error for params validation failure", async () => {
      const paramSchema = Joi.object({
        id: Joi.number().integer().positive().required(),
      });

      const app = express();
      app.use(express.json());
      app.get("/:id", validateParams(paramSchema), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).get("/not-a-number");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("VALIDATION_ERROR");
      expect(res.body.message).toContain("Parameter");
      expect(Array.isArray(res.body.errors)).toBe(true);

      const errors = res.body.errors;
      expect(errors.some(e => e.field === "id")).toBe(true);
    });
  });

  describe("Error Codes - Machine Readability", () => {
    it("should use recognizable error codes for common validation failures", async () => {
      const testSchema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
        age: Joi.number().min(18).max(120),
        tags: Joi.array().min(1),
      });

      const app = express();
      app.use(express.json());
      app.post("/test", validate(testSchema), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/test").send({
        email: "invalid-email",
        password: "short",
        age: 10,
        tags: [],
      });

      const codes = new Set(res.body.errors.map(e => e.code));
      expect(codes).toContain("INVALID_EMAIL");
      expect(codes).toContain("VALUE_TOO_SHORT");
      expect(codes).toContain("VALUE_BELOW_MINIMUM");
      expect(codes).toContain("ARRAY_TOO_SHORT");
    });

    it("should include FIELD_REQUIRED code for missing required fields", async () => {
      const testSchema = Joi.object({
        name: Joi.string().required(),
      });

      const app = express();
      app.use(express.json());
      app.post("/test", validate(testSchema), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/test").send({});

      const nameErr = res.body.errors.find(e => e.field === "name");
      expect(nameErr.code).toBe("FIELD_REQUIRED");
    });
  });

  describe("Nested Field Paths - Stable Dot-Notation", () => {
    it("should use dot-notation for nested object field paths", async () => {
      const nestedSchema = Joi.object({
        user: Joi.object({
          profile: Joi.object({
            name: Joi.string().required(),
          }).required(),
        }).required(),
      });

      const app = express();
      app.use(express.json());
      app.post("/test", validate(nestedSchema), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/test").send({
        user: { profile: {} },
      });

      const fieldNames = res.body.errors.map(e => e.field);
      expect(fieldNames).toContain("user.profile.name");
    });

    it("should handle array index notation for arrays", async () => {
      const arraySchema = Joi.object({
        items: Joi.array().items(
          Joi.object({
            name: Joi.string().required(),
          })
        ),
      });

      const app = express();
      app.use(express.json());
      app.post("/test", validate(arraySchema), (req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).post("/test").send({
        items: [
          { name: "valid" },
          { name: null },
        ],
      });

      const fieldNames = res.body.errors.map(e => e.field);
      expect(fieldNames.some(f => f.includes("items"))).toBe(true);
    });
  });

  describe("Cross-Endpoint Consistency", () => {
    it("should have identical error shape across auth, payment, and profile endpoints", async () => {
      const endpoints = [
        { schema: authSchemas.register, path: "/auth/register" },
        { schema: batchPaymentSchema, path: "/payments" },
        { schema: editProfileSchema, path: "/profile" },
      ];

      const results = [];
      for (const ep of endpoints) {
        const app = express();
        app.use(express.json());
        app.post(ep.path, validate(ep.schema), (req, res) => {
          res.json({ ok: true });
        });

        const res = await request(app).post(ep.path).send({});
        results.push({
          endpoint: ep.path,
          keys: Object.keys(res.body),
          errorStructure: res.body.errors.length > 0 ? Object.keys(res.body.errors[0]) : [],
        });
      }

      const firstShape = results[0].keys.sort().join(",");
      for (const result of results) {
        expect(result.keys.sort().join(",")).toBe(firstShape);
      }

      const firstErrorStructure = results[0].errorStructure.sort().join(",");
      for (const result of results) {
        if (result.errorStructure.length > 0) {
          expect(result.errorStructure.sort().join(",")).toBe(firstErrorStructure);
        }
      }
    });
  });
});
