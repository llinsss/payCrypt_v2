import WebhookService, { WEBHOOK_EVENTS } from "../services/WebhookService.js";

// GET /webhooks/events
export const getEventTypes = (req, res) => {
  res.json({ success: true, data: Object.values(WEBHOOK_EVENTS) });
};

// POST /webhooks
export const registerWebhook = async (req, res) => {
  try {
    const { url, events, secret } = req.body;
    const user_id = req.user.id;

    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        message: "url and a non-empty events array are required",
      });
    }

    const webhook = await WebhookService.register({ user_id, url, events, secret });

    res.status(201).json({
      success: true,
      message: "Webhook registered. Store the secret — it will not be shown again.",
      data: webhook,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /webhooks
export const getUserWebhooks = async (req, res) => {
  try {
    const webhooks = await WebhookService.getByUser(req.user.id);
    res.json({ success: true, data: webhooks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /webhooks/:id
export const getWebhookById = async (req, res) => {
  try {
    const webhook = await WebhookService.getById(req.params.id, req.user.id);
    res.json({ success: true, data: webhook });
  } catch (err) {
    const status =
      err.message === "Forbidden" ? 403 : err.message === "Webhook not found" ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// PUT /webhooks/:id
export const updateWebhook = async (req, res) => {
  try {
    const { url, events, is_active } = req.body;
    const webhook = await WebhookService.update(req.params.id, req.user.id, {
      url,
      events,
      is_active,
    });
    res.json({ success: true, data: webhook });
  } catch (err) {
    const status =
      err.message === "Forbidden" ? 403 : err.message === "Webhook not found" ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
};

// DELETE /webhooks/:id
export const deleteWebhook = async (req, res) => {
  try {
    await WebhookService.delete(req.params.id, req.user.id);
    res.json({ success: true, message: "Webhook deleted" });
  } catch (err) {
    const status =
      err.message === "Forbidden" ? 403 : err.message === "Webhook not found" ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// POST /webhooks/:id/rotate-secret
export const rotateSecret = async (req, res) => {
  try {
    const result = await WebhookService.rotateSecret(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Secret rotated. Update your integration — the old secret is now invalid.",
      data: result,
    });
  } catch (err) {
    const status =
      err.message === "Forbidden" ? 403 : err.message === "Webhook not found" ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// GET /webhooks/:id/deliveries
export const getDeliveryHistory = async (req, res) => {
  try {
    const events = await WebhookService.getDeliveryHistory(req.params.id, req.user.id);
    res.json({ success: true, data: events });
  } catch (err) {
    const status =
      err.message === "Forbidden" ? 403 : err.message === "Webhook not found" ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// POST /webhooks/verify
// Utility endpoint — lets consumers verify an inbound signature
export const verifySignature = (req, res) => {
  try {
    const { payload, signature, secret } = req.body;

    if (!payload || !signature || !secret) {
      return res.status(400).json({
        success: false,
        message: "payload, signature, and secret are required",
      });
    }

    const valid = WebhookService.verifySignature(payload, signature, secret);
    res.json({ success: true, data: { valid } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
