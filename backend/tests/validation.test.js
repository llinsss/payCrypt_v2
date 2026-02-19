/**
 * Validation Middleware Tests
 *
 * These tests spin up a minimal Express app — no database, no real controllers —
 * and verify that the validation middleware correctly:
 *   - Rejects invalid request bodies with HTTP 400 and a structured errors array
 *   - Allows valid request bodies to pass through to the (mocked) controller
 *
 * Run with: pnpm test
 */

import express from "express";
import request from "supertest";
import { describe, it, expect } from "@jest/globals";

import { validate, validateQuery } from "../middleware/validation.js";
import { authSchemas } from "../schemas/auth.js";
import { processPaymentSchema } from "../schemas/payment.js";
import { kycCreateSchema } from "../schemas/kyc.js";
import { sendToTagSchema, sendToWalletSchema } from "../schemas/wallet.js";
import { transactionQuerySchema } from "../schemas/transaction.js";
import { balanceCreateSchema } from "../schemas/balance.js";
import { editProfileSchema } from "../schemas/user.js";

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
// AUTH – Register
// ─────────────────────────────────────────────
describe("POST /auth/register validation", () => {
    const app = buildApp("post", "/register", validate(authSchemas.register));

    it("returns 400 with errors array when body is empty", async () => {
        const res = await request(app).post("/register").send({});
        expect(res.status).toBe(400);
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it("returns 400 when email is invalid", async () => {
        const res = await request(app).post("/register").send({
            tag: "validtag",
            email: "not-an-email",
            password: "StrongP@ss1",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("email");
    });

    it("returns 400 when password is too weak (no uppercase/special char)", async () => {
        const res = await request(app).post("/register").send({
            tag: "validtag",
            email: "user@test.com",
            password: "weakpassword",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("password");
    });

    it("returns 400 when tag contains invalid characters", async () => {
        const res = await request(app).post("/register").send({
            tag: "bad tag!",
            email: "user@test.com",
            password: "StrongP@ss1",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("tag");
    });

    it("returns 200 when all required fields are valid", async () => {
        const res = await request(app).post("/register").send({
            tag: "valid_user",
            email: "user@test.com",
            password: "StrongP@ss1",
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// ─────────────────────────────────────────────
// AUTH – Login
// ─────────────────────────────────────────────
describe("POST /auth/login validation", () => {
    const app = buildApp("post", "/login", validate(authSchemas.login));

    it("returns 400 when email is missing", async () => {
        const res = await request(app).post("/login").send({ password: "test1234" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("email");
    });

    it("returns 400 when password is missing", async () => {
        const res = await request(app).post("/login").send({ email: "user@test.com" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("password");
    });

    it("returns 200 when both email and password are provided", async () => {
        const res = await request(app).post("/login").send({
            email: "user@test.com",
            password: "anypassword",
        });
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────
// PAYMENT – processPayment body
// ─────────────────────────────────────────────
describe("POST /transactions/payment validation", () => {
    const app = buildApp("post", "/payment", validate(processPaymentSchema));

    it("returns 400 when body is empty", async () => {
        const res = await request(app).post("/payment").send({});
        expect(res.status).toBe(400);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("returns 400 when senderTag is missing", async () => {
        const res = await request(app).post("/payment").send({
            recipientTag: "bob",
            amount: 10,
            senderSecret: "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("senderTag");
    });

    it("returns 400 when amount is negative", async () => {
        const res = await request(app).post("/payment").send({
            senderTag: "alice",
            recipientTag: "bob",
            amount: -5,
            senderSecret: "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("amount");
    });

    it("returns 400 when senderSecret format is invalid", async () => {
        const res = await request(app).post("/payment").send({
            senderTag: "alice",
            recipientTag: "bob",
            amount: 10,
            senderSecret: "INVALID",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("senderSecret");
    });

    it("returns 200 with a valid payment payload", async () => {
        const res = await request(app).post("/payment").send({
            senderTag: "alice",
            recipientTag: "bob",
            amount: 10,
            senderSecret: "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        });
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────
// KYC – Create
// ─────────────────────────────────────────────
describe("POST /kycs validation", () => {
    const app = buildApp("post", "/kyc", validate(kycCreateSchema));

    it("returns 400 when body is empty", async () => {
        const res = await request(app).post("/kyc").send({});
        expect(res.status).toBe(400);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("returns 400 when required fields are missing", async () => {
        const res = await request(app).post("/kyc").send({ first_name: "John" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("last_name");
        expect(fields).toContain("dob");
        expect(fields).toContain("country");
        expect(fields).toContain("id_type");
        expect(fields).toContain("id_number");
    });

    it("returns 400 when id_type is invalid", async () => {
        const res = await request(app).post("/kyc").send({
            first_name: "John",
            last_name: "Doe",
            dob: "1990-01-01",
            country: "Nigeria",
            id_type: "credit_card",
            id_number: "AB12345",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("id_type");
    });

    it("returns 200 with a valid KYC payload", async () => {
        const res = await request(app).post("/kyc").send({
            first_name: "John",
            last_name: "Doe",
            dob: "1990-01-01",
            country: "Nigeria",
            id_type: "national_id",
            id_number: "AB12345",
        });
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────
// WALLETS – send-to-tag
// ─────────────────────────────────────────────
describe("POST /wallets/send-to-tag validation", () => {
    const app = buildApp("post", "/send-to-tag", validate(sendToTagSchema));

    it("returns 400 when receiver_tag is missing", async () => {
        const res = await request(app).post("/send-to-tag").send({ amount: 10, balance_id: 1 });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("receiver_tag");
    });

    it("returns 400 when amount is zero", async () => {
        const res = await request(app)
            .post("/send-to-tag")
            .send({ receiver_tag: "bob", amount: 0, balance_id: 1 });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("amount");
    });

    it("returns 400 when balance_id is missing", async () => {
        const res = await request(app)
            .post("/send-to-tag")
            .send({ receiver_tag: "bob", amount: 10 });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("balance_id");
    });

    it("returns 200 with a valid payload", async () => {
        const res = await request(app)
            .post("/send-to-tag")
            .send({ receiver_tag: "bob_123", amount: 10, balance_id: 1 });
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────
// WALLETS – send-to-wallet
// ─────────────────────────────────────────────
describe("POST /wallets/send-to-wallet validation", () => {
    const app = buildApp("post", "/send-to-wallet", validate(sendToWalletSchema));

    it("returns 400 when receiver_address is missing", async () => {
        const res = await request(app).post("/send-to-wallet").send({ amount: 5, balance_id: 2 });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("receiver_address");
    });

    it("returns 400 when amount is missing", async () => {
        const res = await request(app)
            .post("/send-to-wallet")
            .send({ receiver_address: "0xABC1234567890DEF", balance_id: 2 });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("amount");
    });

    it("returns 200 with a valid payload", async () => {
        const res = await request(app).post("/send-to-wallet").send({
            receiver_address: "0xABC1234567890DEFABC",
            amount: 5,
            balance_id: 2,
        });
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────
// TRANSACTIONS – query params
// ─────────────────────────────────────────────
describe("GET /transactions query validation", () => {
    const app = buildApp("get", "/txns", validateQuery(transactionQuerySchema));

    it("returns 400 when sortOrder is invalid", async () => {
        const res = await request(app).get("/txns?sortOrder=random");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("sortOrder");
    });

    it("returns 400 when limit exceeds 100", async () => {
        const res = await request(app).get("/txns?limit=200");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("limit");
    });

    it("returns 200 with valid query params", async () => {
        const res = await request(app).get("/txns?limit=10&sortOrder=asc&sortBy=amount");
        expect(res.status).toBe(200);
    });

    it("returns 200 with default (empty) query params", async () => {
        const res = await request(app).get("/txns");
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────
// BALANCE – create
// ─────────────────────────────────────────────
describe("POST /balances validation", () => {
    const app = buildApp("post", "/balances", validate(balanceCreateSchema));

    it("returns 400 when required token field is missing", async () => {
        const res = await request(app).post("/balances").send({ symbol: "ETH", chain: "evm" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("token");
    });

    it("returns 400 when amount is negative", async () => {
        const res = await request(app)
            .post("/balances")
            .send({ token: "ethereum", symbol: "ETH", chain: "evm", amount: -1 });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("amount");
    });

    it("returns 200 with valid balance payload", async () => {
        const res = await request(app)
            .post("/balances")
            .send({ token: "ethereum", symbol: "ETH", chain: "evm" });
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────
// USER – edit profile
// ─────────────────────────────────────────────
describe("POST /users/profile validation", () => {
    const app = buildApp("post", "/profile", validate(editProfileSchema));

    it("returns 400 when body is empty (nothing to update)", async () => {
        const res = await request(app).post("/profile").send({});
        expect(res.status).toBe(400);
    });

    it("returns 400 when tag has invalid characters", async () => {
        const res = await request(app).post("/profile").send({ tag: "bad tag!" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("tag");
    });

    it("returns 400 when avatar_url is not a valid URL", async () => {
        const res = await request(app).post("/profile").send({ avatar_url: "not-a-url" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("avatar_url");
    });

    it("returns 200 with a valid profile update", async () => {
        const res = await request(app).post("/profile").send({ tag: "new_tag_99" });
        expect(res.status).toBe(200);
    });
});
