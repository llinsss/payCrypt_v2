import db from "../config/database.js";

// Valid state transitions for the dispute workflow
const VALID_TRANSITIONS = {
    open: ["under_review", "closed"],
    under_review: ["escalated", "resolved", "closed"],
    escalated: ["under_review", "resolved", "closed"],
    resolved: ["closed"],
    closed: [],
};

const Dispute = {
    /**
     * Check if a status transition is valid according to the workflow.
     */
    isValidTransition(currentStatus, newStatus) {
        const allowed = VALID_TRANSITIONS[currentStatus];
        return allowed ? allowed.includes(newStatus) : false;
    },

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
                "transactions.usd_value as transaction_amount",
                "admin.email as admin_email",
                "admin.tag as admin_tag"
            )
            .leftJoin("users", "disputes.user_id", "users.id")
            .leftJoin("transactions", "disputes.transaction_id", "transactions.id")
            .leftJoin("users as admin", "disputes.assigned_admin_id", "admin.id")
            .where("disputes.id", id)
            .first();
    },

    /**
     * Find existing dispute for a transaction (to prevent duplicates).
     */
    async findByTransaction(transactionId) {
        return await db("disputes")
            .where("transaction_id", transactionId)
            .whereIn("status", ["open", "under_review", "escalated"])
            .first();
    },

    async getAll(limit = 10, offset = 0, options = {}) {
        const { status = null, priority = null, category = null } = options;

        let query = db("disputes")
            .select(
                "disputes.*",
                "users.email as user_email",
                "users.tag as user_tag",
                "transactions.usd_value as transaction_amount",
                "admin.email as admin_email",
                "admin.tag as admin_tag"
            )
            .leftJoin("users", "disputes.user_id", "users.id")
            .leftJoin("transactions", "disputes.transaction_id", "transactions.id")
            .leftJoin("users as admin", "disputes.assigned_admin_id", "admin.id");

        if (status) {
            query = query.where("disputes.status", status);
        }
        if (priority) {
            query = query.where("disputes.priority", priority);
        }
        if (category) {
            query = query.where("disputes.category", category);
        }

        return await query
            .limit(limit)
            .offset(offset)
            .orderBy("disputes.created_at", "desc");
    },

    async getByUser(userId, limit = 10, offset = 0, options = {}) {
        const { status = null, priority = null, category = null } = options;

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
        if (priority) {
            query = query.where("disputes.priority", priority);
        }
        if (category) {
            query = query.where("disputes.category", category);
        }

        return await query
            .limit(limit)
            .offset(offset)
            .orderBy("disputes.created_at", "desc");
    },

    async countByUser(userId, options = {}) {
        const { status = null, priority = null, category = null } = options;

        let query = db("disputes")
            .where("disputes.user_id", userId)
            .count("* as total");

        if (status) {
            query = query.where("disputes.status", status);
        }
        if (priority) {
            query = query.where("disputes.priority", priority);
        }
        if (category) {
            query = query.where("disputes.category", category);
        }

        const result = await query.first();
        return result ? result.total : 0;
    },

    async countAll(options = {}) {
        const { status = null, priority = null, category = null } = options;

        let query = db("disputes").count("* as total");

        if (status) {
            query = query.where("status", status);
        }
        if (priority) {
            query = query.where("priority", priority);
        }
        if (category) {
            query = query.where("category", category);
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

    /**
     * Assign an admin to a dispute.
     */
    async assignAdmin(id, adminId) {
        return this.update(id, { assigned_admin_id: adminId });
    },

    /**
     * Escalate a dispute — updates status and records timestamp + reason.
     */
    async escalate(id, reason) {
        return this.update(id, {
            status: "escalated",
            escalation_reason: reason,
            escalated_at: db.fn.now(),
        });
    },

    /**
     * Resolve a dispute — updates status and records timestamp + note.
     */
    async resolve(id, resolutionNote) {
        return this.update(id, {
            status: "resolved",
            resolution_note: resolutionNote || null,
            resolved_at: db.fn.now(),
        });
    },

    /**
     * Close a dispute — updates status and records timestamp.
     */
    async close(id, resolutionNote) {
        return this.update(id, {
            status: "closed",
            resolution_note: resolutionNote || null,
            closed_at: db.fn.now(),
        });
    },

    async delete(id) {
        return await db("disputes").where({ id }).del();
    },

    // ─── Dispute Comments ──────────────────────────────────

    async addComment(disputeId, userId, comment, isAdmin = false) {
        const [id] = await db("dispute_comments").insert({
            dispute_id: disputeId,
            user_id: userId,
            comment,
            is_admin: isAdmin,
        });
        return await db("dispute_comments")
            .select(
                "dispute_comments.*",
                "users.email as user_email",
                "users.tag as user_tag"
            )
            .leftJoin("users", "dispute_comments.user_id", "users.id")
            .where("dispute_comments.id", id)
            .first();
    },

    async getComments(disputeId) {
        return await db("dispute_comments")
            .select(
                "dispute_comments.*",
                "users.email as user_email",
                "users.tag as user_tag"
            )
            .leftJoin("users", "dispute_comments.user_id", "users.id")
            .where("dispute_comments.dispute_id", disputeId)
            .orderBy("dispute_comments.created_at", "asc");
    },

    // ─── Statistics (Admin) ────────────────────────────────

    async getStatistics() {
        const statusCounts = await db("disputes")
            .select("status")
            .count("* as count")
            .groupBy("status");

        const priorityCounts = await db("disputes")
            .select("priority")
            .count("* as count")
            .whereIn("status", ["open", "under_review", "escalated"])
            .groupBy("priority");

        const categoryCounts = await db("disputes")
            .select("category")
            .count("* as count")
            .groupBy("category");

        const totalResult = await db("disputes").count("* as total").first();

        // Average resolution time (in hours) for resolved/closed disputes
        const avgResolution = await db("disputes")
            .whereNotNull("resolved_at")
            .select(
                db.raw("AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as avg_hours")
            )
            .first();

        return {
            total: totalResult ? totalResult.total : 0,
            by_status: statusCounts.reduce((acc, row) => {
                acc[row.status] = row.count;
                return acc;
            }, {}),
            active_by_priority: priorityCounts.reduce((acc, row) => {
                acc[row.priority] = row.count;
                return acc;
            }, {}),
            by_category: categoryCounts.reduce((acc, row) => {
                acc[row.category] = row.count;
                return acc;
            }, {}),
            avg_resolution_hours: avgResolution?.avg_hours || null,
        };
    },
};

export default Dispute;
