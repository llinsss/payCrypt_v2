import ScheduledPayment from "../models/ScheduledPayment.js";
import Notification from "../models/Notification.js";

export const createScheduledPayment = async (req, res) => {
    try {
        const { id: userId, tag: senderTag } = req.user;
        const { recipientTag, amount, asset, assetIssuer, memo, scheduledAt } = req.body;

        if (senderTag === recipientTag) {
            return res.status(400).json({ error: "Cannot schedule a payment to yourself" });
        }

        const scheduledPayment = await ScheduledPayment.create({
            user_id: userId,
            sender_tag: senderTag,
            recipient_tag: recipientTag,
            amount,
            asset: asset || "XLM",
            asset_issuer: assetIssuer || null,
            memo: memo || null,
            scheduled_at: new Date(scheduledAt),
            status: "pending",
        });

        // Create a notification for the user
        await Notification.create({
            user_id: userId,
            title: "Payment Scheduled",
            body: `Payment of ${amount} ${asset || "XLM"} to @${recipientTag} scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
        });

        res.status(201).json({
            message: "Payment scheduled successfully",
            scheduledPayment,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getScheduledPayments = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { limit, offset, status } = req.query;

        const payments = await ScheduledPayment.getByUser(userId, {
            limit: limit || 20,
            offset: offset || 0,
            status: status || null,
        });

        const total = await ScheduledPayment.countByUser(userId, {
            status: status || null,
        });

        res.json({
            payments,
            pagination: {
                total,
                limit: limit || 20,
                offset: offset || 0,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getScheduledPaymentById = async (req, res) => {
    try {
        const { id } = req.params;
        const payment = await ScheduledPayment.findById(id);

        if (!payment) {
            return res.status(404).json({ error: "Scheduled payment not found" });
        }

        if (payment.user_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        res.json(payment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const cancelScheduledPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const payment = await ScheduledPayment.findById(id);

        if (!payment) {
            return res.status(404).json({ error: "Scheduled payment not found" });
        }

        if (payment.user_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        if (payment.status !== "pending") {
            return res.status(400).json({
                error: `Cannot cancel a payment with status '${payment.status}'. Only pending payments can be cancelled.`,
            });
        }

        const cancelled = await ScheduledPayment.cancel(id);

        // Notify the user about the cancellation
        await Notification.create({
            user_id: req.user.id,
            title: "Payment Cancelled",
            body: `Scheduled payment of ${payment.amount} ${payment.asset} to @${payment.recipient_tag} has been cancelled.`,
        });

        res.json({
            message: "Scheduled payment cancelled successfully",
            scheduledPayment: cancelled,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUpcomingPayments = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const payments = await ScheduledPayment.getUpcomingByUser(userId);

        res.json({ payments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
