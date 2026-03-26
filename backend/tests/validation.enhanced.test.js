/**
 * Enhanced Validation Tests
 *
 * Tests custom validators, blockchain address validators, and enhanced schemas.
 * Run with: pnpm test
 */

import express from "express";
import request from "supertest";
import { describe, it, expect } from "@jest/globals";

import { validate, validateQuery, validateParams } from "../middleware/validation.js";
import { validateRequest } from "../middleware/validateRequest.js";

// Schemas
import { balanceCreateSchema, balanceUpdateSchema } from "../schemas/balance.js";
import { sendToTagSchema, sendToWalletSchema, walletUpdateSchema } from "../schemas/wallet.js";
import {
  transactionQuerySchema,
  transactionSearchQuerySchema,
  transactionIdParamSchema,
  transactionTagParamSchema,
} from "../schemas/transaction.js";
import { kycCreateSchema, kycUpdateSchema } from "../schemas/kyc.js";

// Validators
import {
  tagField,
  cryptoAmountField,
  integerIdField,
  numericIdParamSchema,
  strongPasswordField,
  assetSymbolField,
} from "../validators/customValidators.js";
import {
  SUPPORTED_CHAINS,
  blockchainAddressField,
  genericBlockchainAddress,
  stellarSecretKey,
} from "../validators/blockchainValidators.js";
import Joi from "joi";

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildApp(method, path, ...middlewares) {
  const app = express();
  app.use(express.json());
  app[method](path, ...middlewares, (req, res) => {
    res.status(200).json({ ok: true, body: req.body, query: req.query, params: req.params });
  });
  return app;
}

// ─── Custom Validators ────────────────────────────────────────────────────────

describe("tagField validator", () => {
  const schema = Joi.object({ tag: tagField().required() });

  it("accepts valid tags", () => {
    const cases = ["abc", "user_123", "A1B", "a".repeat(20)];
    cases.forEach((tag) => {
      const { error } = schema.validate({ tag });
      expect(error).toBeUndefined();
    });
  });

  it("rejects tags shorter than 3 chars", () => {
    const { error } = schema.validate({ tag: "ab" });
    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/3 characters/);
  });

  it("rejects tags longer than 20 chars", () => {
    const { error } = schema.validate({ tag: "a".repeat(21) });
    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/20 characters/);
  });

  it("rejects tags with spaces or special chars", () => {
    ["bad tag", "bad-tag", "bad@tag", "bad.tag"].forEach((tag) => {
      const { error } = schema.validate({ tag });
      expect(error).toBeDefined();
    });
  });
});

describe("cryptoAmountField validator", () => {
  const schema = Joi.object({ amount: cryptoAmountField().required() });

  it("accepts positive numbers", () => {
    [0.000000001, 1, 100.5, 1e18].forEach((amount) => {
      const { error } = schema.validate({ amount });
      expect(error).toBeUndefined();
    });
  });

  it("rejects zero", () => {
    const { error } = schema.validate({ amount: 0 });
    expect(error).toBeDefined();
  });

  it("rejects negative numbers", () => {
    const { error } = schema.validate({ amount: -1 });
    expect(error).toBeDefined();
  });

  it("rejects non-numeric strings", () => {
    const { error } = schema.validate({ amount: "abc" });
    expect(error).toBeDefined();
  });
});

describe("strongPasswordField validator", () => {
  const schema = Joi.object({ password: strongPasswordField().required() });

  it("accepts strong passwords", () => {
    ["StrongP@ss1", "MyS3cure!Pass", "C0mpl3x#Word"].forEach((password) => {
      const { error } = schema.validate({ password });
      expect(error).toBeUndefined();
    });
  });

  it("rejects password shorter than 8 chars", () => {
    const { error } = schema.validate({ password: "Abc1@" });
    expect(error).toBeDefined();
  });

  it("rejects password without uppercase", () => {
    const { error } = schema.validate({ password: "alllower@1" });
    expect(error).toBeDefined();
  });

  it("rejects password without special character", () => {
    const { error } = schema.validate({ password: "NoSpecial1" });
    expect(error).toBeDefined();
  });

  it("rejects password without digit", () => {
    const { error } = schema.validate({ password: "NoDigit@Pass" });
    expect(error).toBeDefined();
  });
});

describe("assetSymbolField validator", () => {
  const schema = Joi.object({ symbol: assetSymbolField().required() });

  it("accepts valid symbols", () => {
    ["BTC", "ETH", "USDC", "XLM", "A", "ABCDEFGHIJKL"].forEach((symbol) => {
      const { error } = schema.validate({ symbol });
      expect(error).toBeUndefined();
    });
  });

  it("rejects symbol longer than 12 chars", () => {
    const { error } = schema.validate({ symbol: "A".repeat(13) });
    expect(error).toBeDefined();
  });

  it("rejects lowercase symbol", () => {
    // assetSymbolField uses .uppercase() which coerces, so test with invalid chars
    const { error } = schema.validate({ symbol: "ETH$" });
    expect(error).toBeDefined();
  });
});

// ─── Blockchain Validators ────────────────────────────────────────────────────

describe("blockchainAddressField – EVM", () => {
  const schema = Joi.object({ addr: blockchainAddressField("evm").required() });

  it("accepts valid EVM address", () => {
    const { error } = schema.validate({ addr: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12" });
    expect(error).toBeUndefined();
  });

  it("rejects address without 0x prefix", () => {
    const { error } = schema.validate({ addr: "AbCdEf1234567890AbCdEf1234567890AbCdEf12" });
    expect(error).toBeDefined();
  });

  it("rejects address with wrong length", () => {
    const { error } = schema.validate({ addr: "0xAbCd" });
    expect(error).toBeDefined();
  });
});

describe("blockchainAddressField – Starknet", () => {
  const schema = Joi.object({ addr: blockchainAddressField("starknet").required() });

  it("accepts valid Starknet address (short form)", () => {
    const { error } = schema.validate({ addr: "0x049d36570d4e46f48e99674bd3fcc84" });
    expect(error).toBeUndefined();
  });

  it("accepts full 64-char Starknet address", () => {
    const { error } = schema.validate({ addr: "0x" + "a".repeat(64) });
    expect(error).toBeUndefined();
  });

  it("rejects address longer than 64 hex chars", () => {
    const { error } = schema.validate({ addr: "0x" + "a".repeat(65) });
    expect(error).toBeDefined();
  });
});

describe("blockchainAddressField – Flow", () => {
  const schema = Joi.object({ addr: blockchainAddressField("flow").required() });

  it("accepts valid Flow address (0x + 16 hex)", () => {
    const { error } = schema.validate({ addr: "0x1234567890abcdef" });
    expect(error).toBeUndefined();
  });

  it("rejects Flow address with wrong length", () => {
    const { error } = schema.validate({ addr: "0x1234" });
    expect(error).toBeDefined();
  });
});

describe("stellarSecretKey validator", () => {
  const schema = Joi.object({ key: stellarSecretKey().required() });

  it("accepts valid Stellar secret key shape", () => {
    const { error } = schema.validate({ key: "S" + "A".repeat(55) });
    expect(error).toBeUndefined();
  });

  it("rejects key that does not start with S", () => {
    const { error } = schema.validate({ key: "G" + "A".repeat(55) });
    expect(error).toBeDefined();
  });

  it("rejects key with invalid length", () => {
    const { error } = schema.validate({ key: "S" + "A".repeat(10) });
    expect(error).toBeDefined();
  });
});

describe("genericBlockchainAddress validator", () => {
  const schema = Joi.object({ addr: genericBlockchainAddress().required() });

  it("accepts addresses 10-130 chars long", () => {
    const { error } = schema.validate({ addr: "0xabc1234567" });
    expect(error).toBeUndefined();
  });

  it("rejects addresses shorter than 10 chars", () => {
    const { error } = schema.validate({ addr: "0x1" });
    expect(error).toBeDefined();
  });
});

// ─── SUPPORTED_CHAINS constant ────────────────────────────────────────────────

describe("SUPPORTED_CHAINS", () => {
  it("includes all required chains", () => {
    ["starknet", "base", "flow", "lisk", "u2u", "evm", "stellar"].forEach((chain) => {
      expect(SUPPORTED_CHAINS).toContain(chain);
    });
  });
});

// ─── Balance Schema ───────────────────────────────────────────────────────────

describe("POST /balances – balanceCreateSchema", () => {
  const app = buildApp("post", "/balances", validate(balanceCreateSchema));

  it("returns 400 when chain is not in the supported list", async () => {
    const res = await request(app)
      .post("/balances")
      .send({ token: "ethereum", symbol: "ETH", chain: "solana" });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("chain");
  });

  it("returns 400 when symbol exceeds 12 chars", async () => {
    const res = await request(app)
      .post("/balances")
      .send({ token: "ethereum", symbol: "TOOLONGSYMBOL1", chain: "evm" });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("symbol");
  });

  it("returns 400 when amount is negative", async () => {
    const res = await request(app)
      .post("/balances")
      .send({ token: "ethereum", symbol: "ETH", chain: "evm", amount: -5 });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("amount");
  });

  it("returns 200 with a valid payload using a supported chain", async () => {
    for (const chain of SUPPORTED_CHAINS) {
      const res = await request(app)
        .post("/balances")
        .send({ token: "mytoken", symbol: "TKN", chain });
      expect(res.status).toBe(200);
    }
  });
});

describe("PUT /balances/:id – balanceUpdateSchema", () => {
  const app = buildApp("put", "/balances/:id", validate(balanceUpdateSchema));

  it("returns 400 when body is empty", async () => {
    const res = await request(app).put("/balances/1").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is negative", async () => {
    const res = await request(app).put("/balances/1").send({ amount: -1 });
    expect(res.status).toBe(400);
  });

  it("returns 200 with valid partial update", async () => {
    const res = await request(app).put("/balances/1").send({ amount: 10 });
    expect(res.status).toBe(200);
  });
});

// ─── Wallet Update Schema ─────────────────────────────────────────────────────

describe("PUT /wallets/:id – walletUpdateSchema", () => {
  const app = buildApp("put", "/wallets/:id", validate(walletUpdateSchema));

  it("returns 400 when body is empty", async () => {
    const res = await request(app).put("/wallets/1").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 100 chars", async () => {
    const res = await request(app).put("/wallets/1").send({ name: "a".repeat(101) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when is_default is not a boolean", async () => {
    const res = await request(app).put("/wallets/1").send({ is_default: "yes" });
    expect(res.status).toBe(400);
  });

  it("returns 200 with valid name update", async () => {
    const res = await request(app).put("/wallets/1").send({ name: "My Wallet" });
    expect(res.status).toBe(200);
  });

  it("returns 200 with is_default boolean", async () => {
    const res = await request(app).put("/wallets/1").send({ is_default: true });
    expect(res.status).toBe(200);
  });
});

// ─── Transaction ID Param Schema ──────────────────────────────────────────────

describe("GET /transactions/:id – transactionIdParamSchema", () => {
  const app = buildApp("get", "/transactions/:id", validateParams(transactionIdParamSchema));

  it("returns 400 when id is not a number", async () => {
    const res = await request(app).get("/transactions/abc");
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("id");
  });

  it("returns 400 when id is negative", async () => {
    const res = await request(app).get("/transactions/-5");
    expect(res.status).toBe(400);
  });

  it("returns 200 with a valid numeric id", async () => {
    const res = await request(app).get("/transactions/42");
    expect(res.status).toBe(200);
  });
});

// ─── Transaction Tag Param Schema ─────────────────────────────────────────────

describe("GET /transactions/tag/:tag – transactionTagParamSchema", () => {
  const app = buildApp("get", "/tag/:tag", validateParams(transactionTagParamSchema));

  it("returns 400 when tag has invalid characters", async () => {
    const res = await request(app).get("/tag/bad-tag!");
    expect(res.status).toBe(400);
  });

  it("returns 400 when tag is too short", async () => {
    const res = await request(app).get("/tag/ab");
    expect(res.status).toBe(400);
  });

  it("returns 200 with valid tag", async () => {
    const res = await request(app).get("/tag/valid_tag");
    expect(res.status).toBe(200);
  });
});

// ─── Transaction Search Query Schema ──────────────────────────────────────────

describe("GET /transactions/search – transactionSearchQuerySchema", () => {
  const app = buildApp("get", "/search", validateQuery(transactionSearchQuerySchema));

  it("returns 400 when status is invalid", async () => {
    const res = await request(app).get("/search?status=unknown");
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("status");
  });

  it("returns 400 when from date is after to date", async () => {
    const res = await request(app).get("/search?from=2024-12-01&to=2024-01-01");
    expect(res.status).toBe(400);
  });

  it("returns 200 with valid search query", async () => {
    const res = await request(app).get("/search?q=alice&status=completed&limit=10");
    expect(res.status).toBe(200);
  });

  it("returns 200 with empty query (all defaults)", async () => {
    const res = await request(app).get("/search");
    expect(res.status).toBe(200);
  });
});

// ─── numericIdParamSchema ─────────────────────────────────────────────────────

describe("validateParams – numericIdParamSchema", () => {
  const app = buildApp("get", "/resource/:id", validateParams(numericIdParamSchema));

  it("returns 400 for non-numeric id", async () => {
    const res = await request(app).get("/resource/xyz");
    expect(res.status).toBe(400);
  });

  it("returns 400 for float id", async () => {
    const res = await request(app).get("/resource/1.5");
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid integer id", async () => {
    const res = await request(app).get("/resource/7");
    expect(res.status).toBe(200);
  });
});

// ─── KYC – Age Validation ─────────────────────────────────────────────────────

describe("POST /kyc – minimum age enforcement", () => {
  const app = buildApp("post", "/kyc", validate(kycCreateSchema));

  const validBase = {
    first_name: "John",
    last_name: "Doe",
    country: "Nigeria",
    id_type: "national_id",
    id_number: "AB12345",
  };

  it("returns 400 when user is under 18", async () => {
    const under18 = new Date();
    under18.setFullYear(under18.getFullYear() - 17);
    const res = await request(app)
      .post("/kyc")
      .send({ ...validBase, dob: under18.toISOString().split("T")[0] });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/18/);
  });

  it("returns 200 when user is exactly 18", async () => {
    const exactly18 = new Date();
    exactly18.setFullYear(exactly18.getFullYear() - 18);
    exactly18.setDate(exactly18.getDate() - 1); // one day past 18th birthday
    const res = await request(app)
      .post("/kyc")
      .send({ ...validBase, dob: exactly18.toISOString().split("T")[0] });
    expect(res.status).toBe(200);
  });

  it("returns 400 when dob is not a valid ISO date", async () => {
    const res = await request(app)
      .post("/kyc")
      .send({ ...validBase, dob: "not-a-date" });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("dob");
  });

  it("returns 400 when id_image_url is not http/https", async () => {
    const res = await request(app)
      .post("/kyc")
      .send({ ...validBase, dob: "1990-01-01", id_image_url: "ftp://example.com/img.png" });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("id_image_url");
  });
});

// ─── validateRequest (combined body + params) ─────────────────────────────────

describe("validateRequest – combined body and params validation", () => {
  const bodySchema = Joi.object({ name: Joi.string().min(2).required() });
  const app = buildApp(
    "put",
    "/items/:id",
    validateRequest({ params: numericIdParamSchema, body: bodySchema })
  );

  it("returns 400 with errors from both params and body when both are invalid", async () => {
    const res = await request(app).put("/items/abc").send({ name: "x" });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("id");
    expect(fields).toContain("name");
  });

  it("returns 200 when both are valid", async () => {
    const res = await request(app).put("/items/5").send({ name: "Alice" });
    expect(res.status).toBe(200);
  });
});

// ─── Validation error response shape ─────────────────────────────────────────

describe("Validation error response format", () => {
  const app = buildApp("post", "/test", validate(Joi.object({ x: Joi.number().required() })));

  it("returns error:true and errors array on failure", async () => {
    const res = await request(app).post("/test").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
    expect(res.body.message).toBe("Validation failed");
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toHaveProperty("field");
    expect(res.body.errors[0]).toHaveProperty("message");
  });

  it("strips unknown fields from the validated body", async () => {
    const res = await request(app).post("/test").send({ x: 5, unknown: "drop_me" });
    expect(res.status).toBe(200);
    expect(res.body.body).not.toHaveProperty("unknown");
    expect(res.body.body.x).toBe(5);
  });
});
