import db from "../config/database.js";

const ScheduledPayment = {
    async create(data) {
        const [id] = await db("scheduled_payments").insert(data);
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

    async delete(id) {
        return await db("scheduled_payments").where({ id }).del();
    },
};

export default ScheduledPayment;
