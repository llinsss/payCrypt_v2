import Dispute from "../models/Dispute.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import db from "../config/database.js";

// ─── Create Dispute ──────────────────────────────────────

export const createDispute = async (req, res) => {
    try {
        const { transaction_id, reason, description, category, priority, evidence_url } =
            req.body;
        const userId = req.user.id;

        // Verify the transaction exists
        const transaction = await Transaction.findById(transaction_id);
        if (!transaction) {
            return res.status(404).json({ error: "Transaction not found" });
        }

        // Only the transaction owner can dispute it
        if (transaction.user_id !== userId) {
            return res
                .status(403)
                .json({ error: "Unauthorized to dispute this transaction" });
        }

        // Prevent duplicate active disputes on the same transaction
        const existingDispute = await Dispute.findByTransaction(transaction_id);
        if (existingDispute) {
            return res.status(409).json({
                error: "An active dispute already exists for this transaction",
                dispute_id: existingDispute.id,
            });
        }

        const dispute = await Dispute.create({
            transaction_id,
            user_id: userId,
            reason,
            description,
            category,
            priority: priority || "medium",
            evidence_url: evidence_url || null,
            status: "open",
        });

        // Notify user
        await Notification.create({
            user_id: userId,
            type: "dispute_created",
            title: "Dispute Created",
            message: `Your dispute for transaction #${transaction_id} has been submitted. Category: ${category}. We will review it shortly.`,
            read: false,
        });

        res.status(201).json({ success: true, data: dispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Get Disputes ────────────────────────────────────────

export const getDisputes = async (req, res) => {
    try {
        const { limit = 20, offset = 0, status, priority, category } = req.query;
        const userId = req.user.id;
        const isAdmin = req.user.role === "admin";

        const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
        const parsedOffset = Math.max(parseInt(offset) || 0, 0);

        const options = {
            status: status || null,
            priority: priority || null,
            category: category || null,
        };

        const [disputes, total] = await Promise.all([
            isAdmin
                ? Dispute.getAll(parsedLimit, parsedOffset, options)
                : Dispute.getByUser(userId, parsedLimit, parsedOffset, options),
            isAdmin
                ? Dispute.countAll(options)
                : Dispute.countByUser(userId, options),
        ]);

        res.json({
            success: true,
            data: disputes,
            pagination: {
                total,
                limit: parsedLimit,
                offset: parsedOffset,
                hasMore: parsedOffset + disputes.length < total,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Get Dispute by ID ───────────────────────────────────

export const getDisputeById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const isAdmin = req.user.role === "admin";

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        if (!isAdmin && dispute.user_id !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        res.json({ success: true, data: dispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Update Dispute Status (Admin) ───────────────────────

export const updateDisputeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, resolution_note, assigned_admin_id } = req.body;
        const isAdmin = req.user.role === "admin";

        if (!isAdmin) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        // Enforce workflow state transitions
        if (!Dispute.isValidTransition(dispute.status, status)) {
            return res.status(422).json({
                error: `Cannot transition from '${dispute.status}' to '${status}'`,
                current_status: dispute.status,
                allowed_transitions:
                    { open: ["under_review", "closed"], under_review: ["escalated", "resolved", "closed"], escalated: ["under_review", "resolved", "closed"], resolved: ["closed"] }[dispute.status] || [],
            });
        }

        let updatedDispute;

        if (status === "resolved") {
            updatedDispute = await Dispute.resolve(id, resolution_note);
        } else if (status === "closed") {
            updatedDispute = await Dispute.close(id, resolution_note);
        } else {
            const updateData = {
                status,
                resolution_note: resolution_note || null,
            };
            if (assigned_admin_id) {
                updateData.assigned_admin_id = assigned_admin_id;
            }
            updatedDispute = await Dispute.update(id, updateData);
        }

        // Notify the dispute owner
        await Notification.create({
            user_id: dispute.user_id,
            type: "dispute_updated",
            title: "Dispute Status Updated",
            message: `Your dispute #${id} status changed to ${status}${resolution_note ? `. Note: ${resolution_note}` : ""}`,
            read: false,
        });

        res.json({ success: true, data: updatedDispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Escalate Dispute ────────────────────────────────────

export const escalateDispute = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        // Only the dispute owner or an admin can escalate
        const isAdmin = req.user.role === "admin";
        if (!isAdmin && dispute.user_id !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Validate state transition
        if (!Dispute.isValidTransition(dispute.status, "escalated")) {
            return res.status(422).json({
                error: `Cannot escalate a dispute that is currently '${dispute.status}'`,
                current_status: dispute.status,
            });
        }

        const updatedDispute = await Dispute.escalate(id, reason);

        // Notify user about escalation
        await Notification.create({
            user_id: dispute.user_id,
            type: "dispute_escalated",
            title: "Dispute Escalated",
            message: `Your dispute #${id} has been escalated for priority review. Reason: ${reason}`,
            read: false,
        });

        res.json({ success: true, data: updatedDispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Assign Dispute (Admin) ─────────────────────────────

export const assignDispute = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_id } = req.body;
        const isAdmin = req.user.role === "admin";

        if (!isAdmin) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        // Verify the admin user exists and is actually an admin
        const adminUser = await db("users").where({ id: admin_id }).first();
        if (!adminUser || adminUser.role !== "admin") {
            return res
                .status(400)
                .json({ error: "Invalid admin user specified" });
        }

        const updatedDispute = await Dispute.assignAdmin(id, admin_id);

        // Notify the assigned admin
        await Notification.create({
            user_id: admin_id,
            type: "dispute_assigned",
            title: "Dispute Assigned to You",
            message: `Dispute #${id} has been assigned to you for review.`,
            read: false,
        });

        // Notify the dispute owner
        await Notification.create({
            user_id: dispute.user_id,
            type: "dispute_assigned",
            title: "Dispute Under Review",
            message: `Your dispute #${id} has been assigned to an agent and is being reviewed.`,
            read: false,
        });

        res.json({ success: true, data: updatedDispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Add Comment ─────────────────────────────────────────

export const addDisputeComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const userId = req.user.id;
        const isAdmin = req.user.role === "admin";

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        // Only dispute owner or admin can comment
        if (!isAdmin && dispute.user_id !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Cannot comment on closed disputes
        if (dispute.status === "closed") {
            return res
                .status(422)
                .json({ error: "Cannot add comments to a closed dispute" });
        }

        const savedComment = await Dispute.addComment(
            id,
            userId,
            comment,
            isAdmin
        );

        // Notify the other party
        const notifyUserId = isAdmin ? dispute.user_id : (dispute.assigned_admin_id || null);
        if (notifyUserId) {
            await Notification.create({
                user_id: notifyUserId,
                type: "dispute_comment",
                title: "New Comment on Dispute",
                message: `A new comment was added to dispute #${id}`,
                read: false,
            });
        }

        res.status(201).json({ success: true, data: savedComment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Get Comments ────────────────────────────────────────

export const getDisputeComments = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const isAdmin = req.user.role === "admin";

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        if (!isAdmin && dispute.user_id !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const comments = await Dispute.getComments(id);
        res.json({ success: true, data: comments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Dispute Statistics (Admin) ──────────────────────────

export const getDisputeStatistics = async (req, res) => {
    try {
        const isAdmin = req.user.role === "admin";

        if (!isAdmin) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const statistics = await Dispute.getStatistics();
        res.json({ success: true, data: statistics });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
