import db from "../config/database.js";

const Dispute = {
    async create(disputeData) {
        const [id] = await db("disputes").insert(disputeData);
        return this.findById(id);
    },

    async findById(id) {
        return await db("disputes")
            .select(
                "disputes.*",
                "users.email as user_email",
                "users.tag as user_tag",
                "transactions.usd_value as transaction_amount"
            )
            .leftJoin("users", "disputes.user_id", "users.id")
            .leftJoin("transactions", "disputes.transaction_id", "transactions.id")
            .where("disputes.id", id)
            .first();
    },

    async getAll(limit = 10, offset = 0, options = {}) {
        const { status = null } = options;

        let query = db("disputes")
            .select(
                "disputes.*",
                "users.email as user_email",
                "users.tag as user_tag",
                "transactions.usd_value as transaction_amount"
            )
            .leftJoin("users", "disputes.user_id", "users.id")
            .leftJoin("transactions", "disputes.transaction_id", "transactions.id");

        if (status) {
            query = query.where("disputes.status", status);
        }

        return await query
            .limit(limit)
            .offset(offset)
            .orderBy("disputes.created_at", "desc");
    },

    async getByUser(userId, limit = 10, offset = 0, options = {}) {
        const { status = null } = options;

        let query = db("disputes")
            .select(
                "disputes.*",
                "users.email as user_email",
                "users.tag as user_tag",
                "transactions.usd_value as transaction_amount"
            )
            .leftJoin("users", "disputes.user_id", "users.id")
            .leftJoin("transactions", "disputes.transaction_id", "transactions.id")
            .where("disputes.user_id", userId);

        if (status) {
            query = query.where("disputes.status", status);
        }

        return await query
            .limit(limit)
            .offset(offset)
            .orderBy("disputes.created_at", "desc");
    },

    async countByUser(userId, options = {}) {
        const { status = null } = options;

        let query = db("disputes")
            .where("disputes.user_id", userId)
            .count("* as total");

        if (status) {
            query = query.where("disputes.status", status);
        }

        const result = await query.first();
        return result ? result.total : 0;
    },

    async update(id, disputeData) {
        await db("disputes")
            .where({ id })
            .update({
                ...disputeData,
                updated_at: db.fn.now(),
            });
        return this.findById(id);
    },

    async delete(id) {
        return await db("disputes").where({ id }).del();
    },
};

export default Dispute;
