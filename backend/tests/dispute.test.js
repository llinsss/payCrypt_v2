/**
 * Dispute Validation & Workflow Tests
 *
 * These tests spin up a minimal Express app — no database, no real controllers —
 * and verify that the validation middleware correctly:
 *   - Rejects invalid request bodies with HTTP 400 and structured errors
 *   - Allows valid request bodies to pass through
 *
 * Run with: pnpm test
 */

import express from "express";
import request from "supertest";
import { describe, it, expect } from "@jest/globals";

import { validate, validateQuery } from "../middleware/validation.js";
import {
    createDisputeSchema,
    disputeQuerySchema,
    updateDisputeStatusSchema,
    escalateDisputeSchema,
    addCommentSchema,
    assignDisputeSchema,
} from "../schemas/dispute.js";

// Also test the model's state-transition logic directly (pure function, no DB)
import Dispute from "../models/Dispute.js";

// Helper: build a tiny Express app with a single route using the given middleware
function buildApp(method, path, ...middlewares) {
    const app = express();
    app.use(express.json());
    app[method](path, ...middlewares, (req, res) => {
        res.status(200).json({ ok: true });
    });
    return app;
}

// ═══════════════════════════════════════════════
// 1. CREATE DISPUTE – body validation
// ═══════════════════════════════════════════════
describe("POST /disputes – createDisputeSchema", () => {
    const app = buildApp("post", "/disputes", validate(createDisputeSchema));

    it("returns 400 when body is empty", async () => {
        const res = await request(app).post("/disputes").send({});
        expect(res.status).toBe(400);
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it("returns 400 when transaction_id is missing", async () => {
        const res = await request(app).post("/disputes").send({
            reason: "Unauthorized charge",
            description: "I did not authorize this payment",
            category: "unauthorized",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("transaction_id");
    });

    it("returns 400 when reason is missing", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 1,
            description: "Something went wrong",
            category: "other",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("reason");
    });

    it("returns 400 when category is missing", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 1,
            reason: "Duplicate charge",
            description: "I was billed twice",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("category");
    });

    it("returns 400 when category is invalid", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 1,
            reason: "Bad charge",
            description: "Something wrong",
            category: "invalid_category",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("category");
    });

    it("returns 400 when priority is invalid", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 1,
            reason: "Wrong amount",
            description: "Charged $50 instead of $5",
            category: "wrong_amount",
            priority: "urgent", // not a valid priority
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("priority");
    });

    it("returns 400 when evidence_url is not a valid URI", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 1,
            reason: "Fraud",
            description: "Fraudulent activity detected",
            category: "fraud",
            evidence_url: "not-a-url",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("evidence_url");
    });

    it("returns 400 when reason exceeds 255 characters", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 1,
            reason: "x".repeat(256),
            description: "Too long reason",
            category: "other",
        });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("reason");
    });

    it("returns 400 when unknown fields are provided", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 1,
            reason: "Test",
            description: "Test desc",
            category: "other",
            hacker_field: "malicious",
        });
        expect(res.status).toBe(400);
    });

    it("returns 200 with minimum valid payload", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 42,
            reason: "Unauthorized charge",
            description: "I did not authorize this payment of $100",
            category: "unauthorized",
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it("returns 200 with full valid payload including optional fields", async () => {
        const res = await request(app).post("/disputes").send({
            transaction_id: 42,
            reason: "Duplicate charge",
            description: "I was charged twice for the same transaction",
            category: "duplicate",
            priority: "high",
            evidence_url: "https://example.com/screenshot.png",
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it("accepts all valid categories", async () => {
        const categories = [
            "unauthorized",
            "duplicate",
            "wrong_amount",
            "not_received",
            "fraud",
            "other",
        ];
        for (const category of categories) {
            const res = await request(app).post("/disputes").send({
                transaction_id: 1,
                reason: "Test",
                description: "Test description",
                category,
            });
            expect(res.status).toBe(200);
        }
    });

    it("accepts all valid priorities", async () => {
        const priorities = ["low", "medium", "high", "critical"];
        for (const priority of priorities) {
            const res = await request(app).post("/disputes").send({
                transaction_id: 1,
                reason: "Test",
                description: "Test description",
                category: "other",
                priority,
            });
            expect(res.status).toBe(200);
        }
    });
});

// ═══════════════════════════════════════════════
// 2. QUERY DISPUTES – query param validation
// ═══════════════════════════════════════════════
describe("GET /disputes – disputeQuerySchema", () => {
    const app = buildApp("get", "/disputes", validateQuery(disputeQuerySchema));

    it("returns 200 with empty (default) query params", async () => {
        const res = await request(app).get("/disputes");
        expect(res.status).toBe(200);
    });

    it("returns 400 when limit exceeds 100", async () => {
        const res = await request(app).get("/disputes?limit=200");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("limit");
    });

    it("returns 400 when offset is negative", async () => {
        const res = await request(app).get("/disputes?offset=-1");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("offset");
    });

    it("returns 400 when status is invalid", async () => {
        const res = await request(app).get("/disputes?status=invalid");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("status");
    });

    it("returns 400 when priority is invalid", async () => {
        const res = await request(app).get("/disputes?priority=urgent");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("priority");
    });

    it("returns 400 when category is invalid", async () => {
        const res = await request(app).get("/disputes?category=hacking");
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("category");
    });

    it("returns 200 with all valid query filters", async () => {
        const res = await request(app).get(
            "/disputes?limit=10&offset=0&status=open&priority=high&category=fraud"
        );
        expect(res.status).toBe(200);
    });

    it("returns 200 with escalated status filter", async () => {
        const res = await request(app).get("/disputes?status=escalated");
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════════════
// 3. UPDATE DISPUTE STATUS – body validation
// ═══════════════════════════════════════════════
describe("PATCH /disputes/:id/status – updateDisputeStatusSchema", () => {
    const app = buildApp(
        "patch",
        "/disputes/:id/status",
        validate(updateDisputeStatusSchema)
    );

    it("returns 400 when status is missing", async () => {
        const res = await request(app).patch("/disputes/1/status").send({});
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("status");
    });

    it("returns 400 when status is invalid", async () => {
        const res = await request(app)
            .patch("/disputes/1/status")
            .send({ status: "pending" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("status");
    });

    it("returns 400 when status is 'open' (cannot set back to open)", async () => {
        const res = await request(app)
            .patch("/disputes/1/status")
            .send({ status: "open" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("status");
    });

    it("returns 200 with valid status: under_review", async () => {
        const res = await request(app)
            .patch("/disputes/1/status")
            .send({ status: "under_review" });
        expect(res.status).toBe(200);
    });

    it("returns 200 with valid status: escalated", async () => {
        const res = await request(app)
            .patch("/disputes/1/status")
            .send({ status: "escalated" });
        expect(res.status).toBe(200);
    });

    it("returns 200 with valid status: resolved + resolution_note", async () => {
        const res = await request(app)
            .patch("/disputes/1/status")
            .send({ status: "resolved", resolution_note: "Refund issued" });
        expect(res.status).toBe(200);
    });

    it("returns 200 with valid status: closed", async () => {
        const res = await request(app)
            .patch("/disputes/1/status")
            .send({ status: "closed" });
        expect(res.status).toBe(200);
    });

    it("returns 200 with assigned_admin_id", async () => {
        const res = await request(app)
            .patch("/disputes/1/status")
            .send({ status: "under_review", assigned_admin_id: 5 });
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════════════
// 4. ESCALATE DISPUTE – body validation
// ═══════════════════════════════════════════════
describe("POST /disputes/:id/escalate – escalateDisputeSchema", () => {
    const app = buildApp(
        "post",
        "/disputes/:id/escalate",
        validate(escalateDisputeSchema)
    );

    it("returns 400 when reason is missing", async () => {
        const res = await request(app).post("/disputes/1/escalate").send({});
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("reason");
    });

    it("returns 400 when reason is too short (< 10 chars)", async () => {
        const res = await request(app)
            .post("/disputes/1/escalate")
            .send({ reason: "short" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("reason");
    });

    it("returns 400 when reason exceeds 1000 characters", async () => {
        const res = await request(app)
            .post("/disputes/1/escalate")
            .send({ reason: "x".repeat(1001) });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("reason");
    });

    it("returns 200 with a valid escalation reason", async () => {
        const res = await request(app)
            .post("/disputes/1/escalate")
            .send({ reason: "This dispute has not been addressed for over 7 days" });
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════════════
// 5. ADD COMMENT – body validation
// ═══════════════════════════════════════════════
describe("POST /disputes/:id/comments – addCommentSchema", () => {
    const app = buildApp(
        "post",
        "/disputes/:id/comments",
        validate(addCommentSchema)
    );

    it("returns 400 when comment is missing", async () => {
        const res = await request(app).post("/disputes/1/comments").send({});
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("comment");
    });

    it("returns 400 when comment exceeds 2000 characters", async () => {
        const res = await request(app)
            .post("/disputes/1/comments")
            .send({ comment: "x".repeat(2001) });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("comment");
    });

    it("returns 200 with a valid comment", async () => {
        const res = await request(app)
            .post("/disputes/1/comments")
            .send({ comment: "I have additional evidence to share" });
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════════════
// 6. ASSIGN DISPUTE – body validation
// ═══════════════════════════════════════════════
describe("PATCH /disputes/:id/assign – assignDisputeSchema", () => {
    const app = buildApp(
        "patch",
        "/disputes/:id/assign",
        validate(assignDisputeSchema)
    );

    it("returns 400 when admin_id is missing", async () => {
        const res = await request(app).patch("/disputes/1/assign").send({});
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("admin_id");
    });

    it("returns 400 when admin_id is not a number", async () => {
        const res = await request(app)
            .patch("/disputes/1/assign")
            .send({ admin_id: "abc" });
        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e) => e.field);
        expect(fields).toContain("admin_id");
    });

    it("returns 200 with a valid admin_id", async () => {
        const res = await request(app)
            .patch("/disputes/1/assign")
            .send({ admin_id: 3 });
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════════════
// 7. WORKFLOW STATE MACHINE – pure logic tests
// ═══════════════════════════════════════════════
describe("Dispute workflow – isValidTransition", () => {
    // Valid transitions
    it("allows open → under_review", () => {
        expect(Dispute.isValidTransition("open", "under_review")).toBe(true);
    });
    it("allows open → closed", () => {
        expect(Dispute.isValidTransition("open", "closed")).toBe(true);
    });
    it("allows under_review → escalated", () => {
        expect(Dispute.isValidTransition("under_review", "escalated")).toBe(true);
    });
    it("allows under_review → resolved", () => {
        expect(Dispute.isValidTransition("under_review", "resolved")).toBe(true);
    });
    it("allows under_review → closed", () => {
        expect(Dispute.isValidTransition("under_review", "closed")).toBe(true);
    });
    it("allows escalated → under_review (de-escalation)", () => {
        expect(Dispute.isValidTransition("escalated", "under_review")).toBe(true);
    });
    it("allows escalated → resolved", () => {
        expect(Dispute.isValidTransition("escalated", "resolved")).toBe(true);
    });
    it("allows escalated → closed", () => {
        expect(Dispute.isValidTransition("escalated", "closed")).toBe(true);
    });
    it("allows resolved → closed", () => {
        expect(Dispute.isValidTransition("resolved", "closed")).toBe(true);
    });

    // Invalid transitions
    it("blocks open → resolved (must go through review first)", () => {
        expect(Dispute.isValidTransition("open", "resolved")).toBe(false);
    });
    it("blocks open → escalated (must be under review first)", () => {
        expect(Dispute.isValidTransition("open", "escalated")).toBe(false);
    });
    it("blocks closed → anything (terminal state)", () => {
        expect(Dispute.isValidTransition("closed", "open")).toBe(false);
        expect(Dispute.isValidTransition("closed", "under_review")).toBe(false);
        expect(Dispute.isValidTransition("closed", "resolved")).toBe(false);
    });
    it("blocks resolved → open (cannot reopen)", () => {
        expect(Dispute.isValidTransition("resolved", "open")).toBe(false);
    });
    it("blocks unknown status", () => {
        expect(Dispute.isValidTransition("unknown", "open")).toBe(false);
    });
});
