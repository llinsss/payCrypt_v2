import Dispute from "../models/Dispute.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import Notification from "../models/Notification.js";
import AuditLog from "../models/AuditLog.js";
import { sendEmail } from "../services/external/smtp.js";
import db from "../config/database.js";

// ─── List Disputes ───────────────────────────────────────

export const listDisputes = async (req, res) => {
    try {
        const { limit = 20, offset = 0, status, priority, category } = req.query;

        const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
        const parsedOffset = Math.max(parseInt(offset) || 0, 0);

        const options = {
            status: status || null,
            priority: priority || null,
            category: category || null,
        };

        const [disputes, total] = await Promise.all([
            Dispute.getAll(parsedLimit, parsedOffset, options),
            Dispute.countAll(options),
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

// ─── Get Dispute Detail ──────────────────────────────────

export const getDisputeDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        const comments = await Dispute.getComments(id);

        res.json({ success: true, data: { ...dispute, comments } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Update Dispute (status, admin notes, resolution outcome) ───

export const updateDispute = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes, outcome } = req.body;

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ error: "Dispute not found" });
        }

        if (status && !Dispute.isValidTransition(dispute.status, status)) {
            return res.status(422).json({
                error: `Cannot transition from '${dispute.status}' to '${status}'`,
                current_status: dispute.status,
            });
        }

        const updateData = {};
        if (adminNotes !== undefined) updateData.admin_notes = adminNotes;
        if (status) updateData.status = status;

        let refunded = false;

        if (status === "resolved") {
            updateData.resolved_at = db.fn.now();
            updateData.resolved_by = req.user.id;
            updateData.outcome = outcome || null;

            if (outcome === "upheld") {
                const transaction = await Transaction.findById(dispute.transaction_id);
                const wallet = transaction ? await Wallet.getByUserId(dispute.user_id) : null;
                if (transaction && wallet) {
                    await Wallet.credit(wallet.id, transaction.amount);
                    refunded = true;
                }
            }
        } else if (status === "closed") {
            updateData.closed_at = db.fn.now();
        }

        const updatedDispute = await Dispute.update(id, updateData);

        await AuditLog.create({
            userId: req.user.id,
            action: "dispute_admin_update",
            resource: "dispute",
            resourceId: String(id),
            details: {
                previousStatus: dispute.status,
                newStatus: status || dispute.status,
                adminNotes: adminNotes || null,
                outcome: outcome || null,
                refunded,
            },
            method: "PATCH",
            endpoint: `/admin/disputes/${id}`,
        });

        if (status === "resolved") {
            const message = `Your dispute #${id} has been resolved. Outcome: ${outcome || "reviewed"}.` +
                (refunded ? " A refund has been credited to your wallet." : "") +
                (adminNotes ? ` Note: ${adminNotes}` : "");

            await Notification.create({
                user_id: dispute.user_id,
                type: "dispute_resolved",
                title: "Dispute Resolved",
                message,
                read: false,
            });

            if (dispute.user_email) {
                await sendEmail(dispute.user_email, "Your Dispute Has Been Resolved", message)
                    .catch((err) => console.error("Email error (dispute resolution):", err.message));
            }
        }

        res.json({ success: true, data: updatedDispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
