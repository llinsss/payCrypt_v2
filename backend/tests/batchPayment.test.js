/**
 * Batch Payment Validation Tests
 *
 * These tests follow the repo's existing validation-middleware pattern and
 * verify request-shape enforcement for transaction batching.
 */

import express from "express";
import request from "supertest";
import { describe, it, expect } from "@jest/globals";

import { validate } from "../middleware/validation.js";
import { batchPaymentSchema } from "../schemas/payment.js";

function buildApp(method, path, ...middlewares) {
  const app = express();
  app.use(express.json());
  app[method](path, ...middlewares, (req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe("POST /transactions/batches validation", () => {
  const app = buildApp("post", "/transactions/batches", validate(batchPaymentSchema));

  const validPayload = {
    senderTag: "alice_123",
    payments: [
      {
        recipientTag: "bob_123",
        amount: 12.5,
      },
    ],
  };

  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/transactions/batches").send({});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("returns 400 when payments is missing", async () => {
    const res = await request(app).post("/transactions/batches").send({
      senderTag: "alice_123",
    });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error) => error.field);
    expect(fields).toContain("payments");
  });

  it("returns 400 when payments is empty", async () => {
    const res = await request(app).post("/transactions/batches").send({
      ...validPayload,
      payments: [],
    });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error) => error.field);
    expect(fields).toContain("payments");
  });

  it("returns 400 when a payment recipientTag is invalid", async () => {
    const res = await request(app).post("/transactions/batches").send({
      ...validPayload,
      payments: [
        {
          recipientTag: "bad tag!",
          amount: 12.5,
        },
      ],
    });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error) => error.field);
    expect(fields).toContain("recipientTag");
  });

  it("returns 400 when a payment amount is invalid", async () => {
    const res = await request(app).post("/transactions/batches").send({
      ...validPayload,
      payments: [
        {
          recipientTag: "bob_123",
          amount: 0,
        },
      ],
    });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error) => error.field);
    expect(fields).toContain("amount");
  });

  it("returns 400 when assetIssuer is missing for a custom asset", async () => {
    const res = await request(app).post("/transactions/batches").send({
      ...validPayload,
      asset: "USDC",
    });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error) => error.field);
    expect(fields).toContain("assetIssuer");
  });

  it("returns 400 when senderSecret is included", async () => {
    const res = await request(app).post("/transactions/batches").send({
      ...validPayload,
      senderSecret: "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error) => error.field);
    expect(fields).toContain("senderSecret");
  });

  it("returns 200 with a valid atomic batch payload", async () => {
    const res = await request(app).post("/transactions/batches").send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 when additionalSecrets is included", async () => {
    const res = await request(app).post("/transactions/batches").send({
      ...validPayload,
      atomic: false,
      memo: "team payout",
      additionalSecrets: [
        "SBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      ],
    });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error) => error.field);
    expect(fields).toContain("additionalSecrets");
  });

  it("returns 200 with a valid non-atomic batch payload", async () => {
    const res = await request(app).post("/transactions/batches").send({
      ...validPayload,
      atomic: false,
      memo: "team payout",
      payments: [
        {
          recipientTag: "bob_123",
          amount: 10,
          notes: "ops",
        },
        {
          recipientTag: "carol_123",
          amount: 5,
          notes: "design",
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
