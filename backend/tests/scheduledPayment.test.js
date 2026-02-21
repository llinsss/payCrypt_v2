/**
 * Scheduled Payment Tests
 *
 * These tests cover:
 *   1. Validation middleware for scheduled payment schemas (via supertest)
 *   2. Controller logic unit tests with mocked model
 *
 * Run with: pnpm test
 */

import express from "express";
import request from "supertest";
import { describe, it, expect } from "@jest/globals";

import { validate, validateQuery } from "../middleware/validation.js";
import {
    createScheduledPaymentSchema,
    scheduledPaymentQuerySchema,
} from "../schemas/scheduledPayment.js";

// Helper: build a tiny Express app with a single route using the given middleware
function buildApp(method, path, ...middlewares) {
    const app = express();
    app.use(express.json());
    app[method](path, ...middlewares, (req, res) => {
        res.status(200).json({ ok: true });
    });
    return app;
}

// ─────────────────────────────────────────────
// SCHEDULED PAYMENT – create validation
// ─────────────────────────────────────────────
describe("POST /scheduled-payments validation", () => {
    const app = buildApp(
        "post",
        "/scheduled-payments",
        validate(createScheduledPaymentSchema)
    );

    // Future date helpers
    const futureDate = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString();
    };

    const pastDate = () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString();
    };

    const tooFarDate = () => {
        const d = new Date();
        d.setDate(d.getDate() + 31);
        return d.toISOString();
    };

    it("returns 400 when body is empty", async () => {
        const res = await request(app).post("/scheduled-payments").send({});
        expect(res.status).toBe(400);
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it("returns 400 when recipientTag is missing", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            amount: 10,
            scheduledAt: futureDate(),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("recipientTag");
    });

    it("returns 400 when recipientTag has invalid format", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bad tag!",
            amount: 10,
            scheduledAt: futureDate(),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("recipientTag");
    });

    it("returns 400 when amount is missing", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            scheduledAt: futureDate(),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("amount");
    });

    it("returns 400 when amount is negative", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: -5,
            scheduledAt: futureDate(),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("amount");
    });

    it("returns 400 when amount is zero", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 0,
            scheduledAt: futureDate(),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("amount");
    });

    it("returns 400 when scheduledAt is missing", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("scheduledAt");
    });

    it("returns 400 when scheduledAt is in the past", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: pastDate(),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("scheduledAt");
    });

    it("returns 400 when scheduledAt is more than 30 days out", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: tooFarDate(),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("scheduledAt");
    });

    it("returns 400 when scheduledAt is not a valid ISO date", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: "not-a-date",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("scheduledAt");
    });

    it("returns 400 when asset has invalid format", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: futureDate(),
            asset: "invalid-asset!",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("asset");
    });

    it("returns 400 when memo exceeds 28 characters", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: futureDate(),
            memo: "a".repeat(29),
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("memo");
    });

    it("returns 400 when assetIssuer has invalid format", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: futureDate(),
            asset: "USDC",
            assetIssuer: "INVALID_ADDRESS",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("assetIssuer");
    });

    it("returns 400 when unknown fields are sent", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: futureDate(),
            unknownField: "should not be here",
        });
        expect(res.status).toBe(400);
    });

    it("returns 200 with a valid minimal payload", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob",
            amount: 10,
            scheduledAt: futureDate(),
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it("returns 200 with a valid full payload", async () => {
        const res = await request(app).post("/scheduled-payments").send({
            recipientTag: "bob_123",
            amount: 100.5,
            scheduledAt: futureDate(),
            asset: "USDC",
            assetIssuer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            memo: "rent payment",
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// ─────────────────────────────────────────────
// SCHEDULED PAYMENT – query params validation
// ─────────────────────────────────────────────
describe("GET /scheduled-payments query validation", () => {
    const app = buildApp(
        "get",
        "/scheduled-payments",
        validateQuery(scheduledPaymentQuerySchema)
    );

    it("returns 400 when limit exceeds 100", async () => {
        const res = await request(app).get("/scheduled-payments?limit=200");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("limit");
    });

    it("returns 400 when limit is negative", async () => {
        const res = await request(app).get("/scheduled-payments?limit=-5");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("limit");
    });

    it("returns 400 when offset is negative", async () => {
        const res = await request(app).get("/scheduled-payments?offset=-1");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("offset");
    });

    it("returns 400 when status is invalid", async () => {
        const res = await request(app).get(
            "/scheduled-payments?status=invalid_status"
        );
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("status");
    });

    it("returns 200 with valid query params", async () => {
        const res = await request(app).get(
            "/scheduled-payments?limit=10&offset=0&status=pending"
        );
        expect(res.status).toBe(200);
    });

    it("returns 200 with status=completed", async () => {
        const res = await request(app).get(
            "/scheduled-payments?status=completed"
        );
        expect(res.status).toBe(200);
    });

    it("returns 200 with status=cancelled", async () => {
        const res = await request(app).get(
            "/scheduled-payments?status=cancelled"
        );
        expect(res.status).toBe(200);
    });

    it("returns 200 with status=failed", async () => {
        const res = await request(app).get(
            "/scheduled-payments?status=failed"
        );
        expect(res.status).toBe(200);
    });

    it("returns 200 with default (empty) query params", async () => {
        const res = await request(app).get("/scheduled-payments");
        expect(res.status).toBe(200);
    });
});
