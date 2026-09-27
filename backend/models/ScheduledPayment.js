import db from "../config/database.js";

// How long a scheduler replica owns a claimed payment before another replica
// may recover it (e.g. after a crash mid-execution).
export const CLAIM_TTL_MS = 5 * 60 * 1000;

// Stable per occurrence: a recovered claim reuses the key, so PaymentService
// replays instead of paying twice. Retries and resumes reschedule the payment
// (new scheduled_at), which yields a fresh key.
export const idempotencyKeyFor = (payment) =>
    `scheduled-payment:${payment.id}:${new Date(payment.scheduled_at).getTime()}`;

const ScheduledPayment = {
    async create(data) {
        const [{ id }] = await db("scheduled_payments").insert(data).returning("id");
        return this.findById(id);
    },

    async findById(id) {
        return await db("scheduled_payments")
            .select(
                "scheduled_payments.*",
                "users.email as user_email",
                "users.tag as user_tag"
            )
            .leftJoin("users", "scheduled_payments.user_id", "users.id")
            .where("scheduled_payments.id", id)
            .first();
    },

    async getByUser(userId, options = {}) {
        const { limit = 20, offset = 0, status = null } = options;

        let query = db("scheduled_payments")
            .select(
                "scheduled_payments.*",
                "users.email as user_email",
                "users.tag as user_tag"
            )
            .leftJoin("users", "scheduled_payments.user_id", "users.id")
            .where("scheduled_payments.user_id", userId);

        if (status) {
            query = query.where("scheduled_payments.status", status);
        }

        return await query
            .limit(limit)
            .offset(offset)
            .orderBy("scheduled_payments.scheduled_at", "asc");
    },

    async countByUser(userId, options = {}) {
        const { status = null } = options;

        let query = db("scheduled_payments")
            .where("scheduled_payments.user_id", userId)
            .count("* as total");

        if (status) {
            query = query.where("scheduled_payments.status", status);
        }

        const result = await query.first();
        return result ? result.total : 0;
    },

    async getDuePayments(now) {
        return await db("scheduled_payments")
            .select(
                "scheduled_payments.*",
                "users.email as user_email",
                "users.tag as user_tag"
            )
            .leftJoin("users", "scheduled_payments.user_id", "users.id")
            .where("scheduled_payments.status", "pending")
            .where("scheduled_payments.scheduled_at", "<=", now)
            .orderBy("scheduled_payments.scheduled_at", "asc");
    },

    // Atomically claims due payments for one worker. FOR UPDATE SKIP LOCKED
    // guarantees concurrent schedulers never claim the same row; "processing"
    // rows whose claim has expired are recovered.
    async claimDuePayments({ workerId, now = new Date(), ttlMs = CLAIM_TTL_MS, limit = 50 }) {
        const ids = await db.transaction(async (trx) => {
            const rows = await trx("scheduled_payments")
                .select("id")
                .where((q) => q.where("status", "pending").where("scheduled_at", "<=", now))
                .orWhere((q) => q.where("status", "processing").where("claim_expires_at", "<=", now))
                .orderBy("scheduled_at", "asc")
                .limit(limit)
                .forUpdate()
                .skipLocked();

            if (rows.length === 0) return [];

            const claimed = await trx("scheduled_payments")
                .whereIn("id", rows.map((row) => row.id))
                .update({
                    status: "processing",
                    claimed_by: workerId,
                    claim_expires_at: new Date(now.getTime() + ttlMs),
                    updated_at: trx.fn.now(),
                })
                .returning("id");
            return claimed.map((row) => row.id);
        });

        if (ids.length === 0) return [];

        return await db("scheduled_payments")
            .select(
                "scheduled_payments.*",
                "users.email as user_email",
                "users.tag as user_tag"
            )
            .leftJoin("users", "scheduled_payments.user_id", "users.id")
            .whereIn("scheduled_payments.id", ids)
            .orderBy("scheduled_payments.scheduled_at", "asc");
    },

    // Marks a claimed payment completed only if this worker still owns the
    // claim. Returns false when the claim was lost (expired and recovered).
    async completeClaim(id, workerId) {
        const updated = await db("scheduled_payments")
            .where({ id, status: "processing", claimed_by: workerId })
            .update({
                status: "completed",
                executed_at: new Date(),
                failure_count: 0,
                failure_reason: null,
                last_failure_at: null,
                claimed_by: null,
                claim_expires_at: null,
                updated_at: db.fn.now(),
            });
        return updated > 0;
    },

    async getUpcomingForNotification(windowMinutes = 30) {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

        return await db("scheduled_payments")
            .select(
                "scheduled_payments.*",
                "users.email as user_email",
                "users.tag as user_tag"
            )
            .leftJoin("users", "scheduled_payments.user_id", "users.id")
            .where("scheduled_payments.status", "pending")
            .whereNull("scheduled_payments.notified_at")
            .where("scheduled_payments.scheduled_at", "<=", windowEnd)
            .where("scheduled_payments.scheduled_at", ">", now)
            .orderBy("scheduled_payments.scheduled_at", "asc");
    },

    async getUpcomingByUser(userId, limit = 10) {
        return await db("scheduled_payments")
            .select("scheduled_payments.*")
            .where("scheduled_payments.user_id", userId)
            .where("scheduled_payments.status", "pending")
            .where("scheduled_payments.scheduled_at", ">", new Date())
            .orderBy("scheduled_payments.scheduled_at", "asc")
            .limit(limit);
    },

    async update(id, data) {
        await db("scheduled_payments")
            .where({ id })
            .update({
                ...data,
                updated_at: db.fn.now(),
            });
        return this.findById(id);
    },

    async cancel(id) {
        return this.update(id, { status: "cancelled" });
    },

    // Records an execution failure. After `maxFailures` consecutive failures
    // the payment is paused instead of retried on the next scheduler tick.
    async recordFailure(id, reason, { maxFailures = 3, retryDelayMs = 15 * 60 * 1000 } = {}) {
        const current = await this.findById(id);
        const failureCount = (current?.failure_count || 0) + 1;
        const paused = failureCount >= maxFailures;

        return this.update(id, {
            failure_count: failureCount,
            failure_reason: reason,
            last_failure_at: new Date(),
            status: paused ? "paused" : "pending",
            claimed_by: null,
            claim_expires_at: null,
            scheduled_at: paused ? current.scheduled_at : new Date(Date.now() + retryDelayMs),
        });
    },

    async resume(id) {
        return this.update(id, {
            status: "pending",
            failure_count: 0,
            failure_reason: null,
            last_failure_at: null,
            scheduled_at: new Date(),
        });
    },

    async delete(id) {
        return await db("scheduled_payments").where({ id }).del();
    },
};

export default ScheduledPayment;
