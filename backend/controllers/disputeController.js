import Dispute from "../models/Dispute.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import db from "../config/database.js";

export const createDispute = async (req, res) => {
    try {
        const { transaction_id, reason, description, evidence_url } = req.body;
        const userId = req.user.id;

        const transaction = await Transaction.findById(transaction_id);
        if (!transaction) {
            return res.status(404).json({ error: "Transaction not found" });
        }

        if (transaction.user_id !== userId) {
            return res.status(403).json({ error: "Unauthorized to dispute this transaction" });
        }

        const dispute = await Dispute.create({
            transaction_id,
            user_id: userId,
            reason,
            description,
            evidence_url: evidence_url || null,
            status: "open",
        });

        await Notification.create({
            user_id: userId,
            type: "dispute_created",
            title: "Dispute Created",
            message: `Your dispute for transaction #${transaction_id} has been submitted`,
            read: false,
        });

        res.status(201).json({ success: true, data: dispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getDisputes = async (req, res) => {
    try {
        const { limit = 20, offset = 0, status } = req.query;
        const userId = req.user.id;
        const isAdmin = req.user.role === "admin";

        const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
        const parsedOffset = Math.max(parseInt(offset) || 0, 0);

        const options = { status: status || null };

        const [disputes, total] = await Promise.all([
            isAdmin
                ? Dispute.getAll(parsedLimit, parsedOffset, options)
                : Dispute.getByUser(userId, parsedLimit, parsedOffset, options),
            isAdmin
                ? db("disputes").count("* as total").first().then(r => r.total)
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

export const updateDisputeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, resolution_note } = req.body;
        const isAdmin = req.user.role === "admin";

        if (!isAdmin) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        const updatedDispute = await Dispute.update(id, {
            status,
            resolution_note: resolution_note || null,
        });

        await Notification.create({
            user_id: dispute.user_id,
            type: "dispute_updated",
            title: "Dispute Status Updated",
            message: `Your dispute #${id} status changed to ${status}`,
            read: false,
        });

        res.json({ success: true, data: updatedDispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
