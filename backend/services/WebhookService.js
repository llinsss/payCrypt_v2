import axios from "axios";
import crypto from "crypto";
import Webhook from "../models/Webhook.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { webhookQueue } from "../queues/webhook.js";

export const WEBHOOK_EVENTS = {
  PAYMENT_COMPLETED: "payment.completed",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_PENDING: "payment.pending",
  PAYMENT_REFUNDED: "payment.refunded",
  WALLET_CREDITED: "wallet.credited",
  WALLET_DEBITED: "wallet.debited",
  KYC_APPROVED: "kyc.approved",
  KYC_REJECTED: "kyc.rejected",
  TRANSACTION_STATUS_CHANGED: "transaction.status_changed",
};

const WebhookService = {
  async sendStatusChangeWebhook(transaction, oldStatus, newStatus) {
    return this.dispatch(
      WEBHOOK_EVENTS.TRANSACTION_STATUS_CHANGED,
      {
        transaction_id: transaction.id,
        user_id: transaction.user_id,
        old_status: oldStatus,
        new_status: newStatus,
        amount: transaction.amount,
        usd_value: transaction.usd_value,
        type: transaction.type,
      },
      transaction.user_id,
    );
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  generateSecret() {
    return crypto.randomBytes(32).toString("hex");
  },

  generateSignature(payload, secret) {
    return (
      "sha256=" +
      crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")
    );
  },

  verifySignature(payload, signature, secret) {
    const expected = this.generateSignature(payload, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  // ── Registration ────────────────────────────────────────────────────────────

  async register({ user_id, url, events, secret }) {
    const validEvents = Object.values(WEBHOOK_EVENTS);
    const invalidEvents = events.filter((e) => !validEvents.includes(e));
    if (invalidEvents.length) {
      throw new Error(`Invalid event types: ${invalidEvents.join(", ")}`);
    }

    const webhookSecret = secret || this.generateSecret();

    const webhook = await Webhook.create({
      user_id,
      url,
      events: JSON.stringify(events),
      secret: webhookSecret,
      is_active: true,
      status: "active",
      retry_count: 0,
    });

    return { ...webhook, secret: webhookSecret };
  },

  async getByUser(user_id) {
    const webhooks = await Webhook.findByUserId(user_id);
    return webhooks.map(({ secret: _s, ...rest }) => rest);
  },

  async getById(id, user_id) {
    const webhook = await Webhook.findById(id);
    if (!webhook) throw new Error("Webhook not found");
    if (webhook.user_id !== user_id) throw new Error("Forbidden");
    const { secret: _s, ...rest } = webhook;
    return rest;
  },

  async update(id, user_id, { url, events, is_active }) {
    const webhook = await Webhook.findById(id);
    if (!webhook) throw new Error("Webhook not found");
    if (webhook.user_id !== user_id) throw new Error("Forbidden");

    if (events) {
      const validEvents = Object.values(WEBHOOK_EVENTS);
      const invalidEvents = events.filter((e) => !validEvents.includes(e));
      if (invalidEvents.length)
        throw new Error(`Invalid event types: ${invalidEvents.join(", ")}`);
    }

    return Webhook.update(id, {
      ...(url && { url }),
      ...(events && { events: JSON.stringify(events) }),
      ...(is_active !== undefined && { is_active }),
    });
  },

  async delete(id, user_id) {
    const webhook = await Webhook.findById(id);
    if (!webhook) throw new Error("Webhook not found");
    if (webhook.user_id !== user_id) throw new Error("Forbidden");
    await Webhook.delete(id);
  },

  async rotateSecret(id, user_id) {
    const webhook = await Webhook.findById(id);
    if (!webhook) throw new Error("Webhook not found");
    if (webhook.user_id !== user_id) throw new Error("Forbidden");
    const newSecret = this.generateSecret();
    await Webhook.update(id, { secret: newSecret });
    return { secret: newSecret };
  },

  // ── Delivery ─────────────────────────────────────────────────────────────────

  async dispatch(eventType, data, user_id = null) {
    const webhooks = await Webhook.findActive(user_id || undefined);
    if (!webhooks.length) return;

    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    for (const webhook of webhooks) {
      const subscribedEvents =
        typeof webhook.events === "string" ? JSON.parse(webhook.events) : webhook.events;

      if (!subscribedEvents.includes(eventType)) continue;

      let eventId = null;
      try {
        const event = await WebhookEvent.create({
          webhook_id: webhook.id,
          event_type: eventType,
          payload: JSON.stringify(payload),
          status: "pending",
          attempts: 0,
        });
        eventId = event.id;
      } catch (err) {
        console.error("Failed to create WebhookEvent record:", err.message);
      }

      if (!webhookQueue) {
        console.warn("Webhook queue unavailable — skipping delivery");
        continue;
      }

      await webhookQueue.add(
        "deliver",
        {
          webhookId: webhook.id,
          eventId,
          url: webhook.url,
          secret: webhook.secret,
          payload,
        },
        {
          jobId: eventId ? `event-${eventId}` : undefined,
        },
      );
    }
  },

  async sendPaymentCompletedWebhook(transaction) {
    return this.dispatch(
      WEBHOOK_EVENTS.PAYMENT_COMPLETED,
      {
        transaction_id: transaction.id,
        amount: transaction.amount,
        status: transaction.status,
      },
      transaction.user_id,
    );
  },

  async sendPaymentFailedWebhook(transaction, reason) {
    return this.dispatch(
      WEBHOOK_EVENTS.PAYMENT_FAILED,
      { transaction_id: transaction.id, amount: transaction.amount, reason },
      transaction.user_id,
    );
  },

  async getDeliveryHistory(webhookId, user_id) {
    const webhook = await Webhook.findById(webhookId);
    if (!webhook) throw new Error("Webhook not found");
    if (webhook.user_id !== user_id) throw new Error("Forbidden");
    return WebhookEvent.findByWebhookId(webhookId);
  },
};

export default WebhookService;
