/**
 * Exactly-once claiming of scheduled payments across replicas (issue #588).
 *
 * Runs the real claim SQL against PostgreSQL in an isolated schema, so it
 * exercises FOR UPDATE SKIP LOCKED between genuinely concurrent transactions.
 * Skipped when no database is reachable (CI provides one).
 */
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import knexFactory from "knex";
import { up as createScheduledPayments } from "../migrations/20260220000000_create_scheduled_payments.js";
import { up as addFailureTracking } from "../migrations/20260726000000_add_failure_tracking_to_scheduled_payments.js";
import {
  up as addClaimColumns,
  down as dropClaimColumns,
} from "../migrations/20260924000000_add_claim_columns_to_scheduled_payments.js";

const schema = `sp_claim_${process.pid}_${Date.now()}`;
const connection = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "",
};

const db = knexFactory({
  client: "pg",
  connection,
  searchPath: [schema],
  pool: { min: 0, max: 6 },
  acquireConnectionTimeout: 3000,
});

const dbAvailable = await db
  .raw("select 1")
  .then(() => true)
  .catch(() => false);

jest.unstable_mockModule("../config/database.js", () => ({ default: db }));
const { default: ScheduledPayment, idempotencyKeyFor } = await import("../models/ScheduledPayment.js");

const describeDb = dbAvailable ? describe : describe.skip;
const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 60 * 60_000);

const insertPayments = (rows) =>
  db("scheduled_payments")
    .insert(
      rows.map((row) => ({
        user_id: 1,
        sender_tag: "alice",
        recipient_tag: "bob",
        amount: 1,
        scheduled_at: PAST,
        ...row,
      }))
    )
    .returning("id")
    .then((ids) => ids.map((r) => r.id));

describeDb("ScheduledPayment claims (PostgreSQL)", () => {
  beforeAll(async () => {
    await db.raw("create schema ??", [schema]);
    await db.schema.createTable("users", (t) => {
      t.increments("id");
      t.string("email");
      t.string("tag");
    });
    await db.schema.createTable("transactions", (t) => t.increments("id"));
    await createScheduledPayments(db);
    await addFailureTracking(db);
    await addClaimColumns(db);
    await db("users").insert({ id: 1, email: "alice@example.com", tag: "alice" });
  });

  afterAll(async () => {
    if (dbAvailable) await db.raw("drop schema if exists ?? cascade", [schema]);
    await db.destroy();
  });

  beforeEach(() => db("scheduled_payments").del());

  it("two competing schedulers claim every due payment exactly once", async () => {
    const dueIds = await insertPayments(Array.from({ length: 40 }, () => ({})));
    await insertPayments([{ scheduled_at: FUTURE }, { status: "completed" }]);

    const drain = async (workerId) => {
      const claimed = [];
      for (;;) {
        const batch = await ScheduledPayment.claimDuePayments({ workerId, limit: 3 });
        if (batch.length === 0) return claimed;
        claimed.push(...batch.map((p) => p.id));
      }
    };

    const [a, b] = await Promise.all([drain("worker-a"), drain("worker-b")]);

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    expect([...a, ...b].sort((x, y) => x - y)).toEqual(dueIds.sort((x, y) => x - y));

    const owners = await db("scheduled_payments").whereIn("id", a).distinct("claimed_by", "status");
    expect(owners).toEqual([{ claimed_by: "worker-a", status: "processing" }]);
  });

  it("returns claimed rows with the user's email for notifications", async () => {
    await insertPayments([{}]);

    const [payment] = await ScheduledPayment.claimDuePayments({ workerId: "worker-a" });

    expect(payment).toMatchObject({ user_email: "alice@example.com", status: "processing" });
    expect(payment.claim_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("recovers expired claims but leaves live claims alone", async () => {
    const [expired] = await insertPayments([
      { status: "processing", claimed_by: "crashed", claim_expires_at: PAST },
    ]);
    await insertPayments([{ status: "processing", claimed_by: "busy", claim_expires_at: FUTURE }]);

    const claimed = await ScheduledPayment.claimDuePayments({ workerId: "worker-b" });

    expect(claimed.map((p) => p.id)).toEqual([expired]);
    expect(claimed[0].claimed_by).toBe("worker-b");
  });

  it("only the current claim owner can complete a payment", async () => {
    const [id] = await insertPayments([
      { status: "processing", claimed_by: "crashed", claim_expires_at: PAST },
    ]);
    await ScheduledPayment.claimDuePayments({ workerId: "worker-b" });

    expect(await ScheduledPayment.completeClaim(id, "crashed")).toBe(false);
    expect(await ScheduledPayment.completeClaim(id, "worker-b")).toBe(true);

    const row = await db("scheduled_payments").where({ id }).first();
    expect(row).toMatchObject({ status: "completed", claimed_by: null, claim_expires_at: null });
    expect(await ScheduledPayment.completeClaim(id, "worker-b")).toBe(false);
  });

  it("keeps the idempotency key stable across claim recovery", async () => {
    const [id] = await insertPayments([
      { status: "processing", claimed_by: "crashed", claim_expires_at: PAST },
    ]);
    const before = await db("scheduled_payments").where({ id }).first();

    const [recovered] = await ScheduledPayment.claimDuePayments({ workerId: "worker-b" });

    expect(idempotencyKeyFor(recovered)).toBe(idempotencyKeyFor(before));
  });

  it("migration is reversible", async () => {
    await dropClaimColumns(db);
    expect(await db.schema.hasColumn("scheduled_payments", "claimed_by")).toBe(false);
    await addClaimColumns(db);
    expect(await db.schema.hasColumn("scheduled_payments", "claim_expires_at")).toBe(true);
  });
});

describe("idempotencyKeyFor", () => {
  it("changes when the payment is rescheduled (retry or resume)", () => {
    const payment = { id: 7, scheduled_at: new Date("2026-01-01T00:00:00Z") };

    expect(idempotencyKeyFor(payment)).toBe(idempotencyKeyFor({ ...payment }));
    expect(idempotencyKeyFor(payment)).not.toBe(
      idempotencyKeyFor({ ...payment, scheduled_at: new Date("2026-01-01T00:15:00Z") })
    );
  });
});
