import WebhookEvent from "../models/WebhookEvent.js";
import WebhookDeliveryService from "../services/WebhookDeliveryService.js";
import Webhook from "../models/Webhook.js";
import AuditLog from "../models/AuditLog.js";

/**
 * Controller handling Admin operations for Webhook Dead Letter Queues (DLQ)
 */

export const getDeadLetters = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // Validate bounds constraint
    const parsedLimit = Math.min(Math.max(Number.parseInt(limit) || 50, 1), 100);
    const parsedOffset = Math.max(Number.parseInt(offset) || 0, 0);

    const deadLetters = await WebhookEvent.findDeadLetters(parsedLimit, parsedOffset);

    return res.status(200).json({
      success: true,
      data: deadLetters,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error("Failed to retrieve DLQ:", error.message);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Record a manual dead-letter retry attempt in the audit log.
 * Deduplication contract: every attempt — accepted, rejected as a duplicate, or
 * errored — produces exactly one `webhook_dlq_retry` audit row identifying the
 * actor and the outcome.
 */
async function auditRetry(req, eventId, outcome, extra = {}) {
  try {
    await AuditLog.create({
      userId: req.user?.id || null,
      action: "webhook_dlq_retry",
      resource: "webhook_event",
      resourceId: String(eventId),
      details: { outcome, ...extra },
      ipAddress: req.ip || null,
      userAgent: req.get?.("user-agent") || null,
      method: req.method,
      endpoint: req.originalUrl || `/admin/webhooks/dlq/${eventId}/retry`,
    });
  } catch (error) {
    console.error("Failed to write webhook DLQ retry audit log:", error.message);
  }
}

export const retryDeadLetter = async (req, res) => {
  const { event_id } = req.params;
  let claimed = false;

  try {
    const event = await WebhookEvent.findById(event_id);

    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    if (event.status !== "dead_letter") {
      await auditRetry(req, event_id, "rejected_not_dead_letter", { status: event.status });
      return res.status(400).json({ success: false, error: "Event is not currently in the dead letter queue." });
    }

    const webhook = await Webhook.findById(event.webhook_id);
    if (!webhook || !webhook.is_active) {
      await auditRetry(req, event_id, "rejected_inactive_webhook", { webhookId: event.webhook_id });
      return res.status(400).json({ success: false, error: "Target webhook endpoint is inactive or deleted." });
    }

    // Parse the JSON payload attached to the event
    let payload;
    try {
      payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
    } catch {
      await auditRetry(req, event_id, "rejected_corrupt_payload");
      return res.status(400).json({ success: false, error: "Corrupted event payload, unable to parse." });
    }

    // Idempotency guard: atomically move the event out of the dead-letter queue.
    // A concurrent retry that loses this race gets 0 rows and is rejected.
    const rows = await WebhookEvent.claimForManualRetry(event.id);
    if (rows === 0) {
      await auditRetry(req, event_id, "rejected_duplicate_in_flight");
      return res.status(409).json({
        success: false,
        error: "A retry for this dead letter event is already in progress.",
      });
    }
    claimed = true;

    console.log(`👨‍💻 Admin manually kicking off dead letter event: ${event.id}`);

    const dispatched = await WebhookDeliveryService.executeDelivery({
      eventId: event.id,
      eventKey: event.idempotency_key || undefined,
      webhookId: webhook.id,
      payload,
      url: webhook.url,
      secret: webhook.secret,
      currentAttempt: 0
    });

    // executeDelivery owns the terminal state transition (success / failed /
    // re-queued / dead_letter) from here, so the event is no longer "retrying".
    claimed = false;

    if (dispatched) {
      await auditRetry(req, event_id, "delivered", { actorId: req.user?.id || null });
      return res.status(200).json({ success: true, message: "Dead letter successfully delivered." });
    } else {
      // By returning false, we know it failed immediately but it was securely queued back onto
      // exponential backoff cycle by handleFailure (attempt 1, next step 1 min delay).
      await auditRetry(req, event_id, "requeued", { actorId: req.user?.id || null });
      return res.status(202).json({
        success: true,
        message: "Delivery failed again but was successfully re-queued into exponential backoff iteration cycle."
      });
    }

  } catch (error) {
    console.error(`Failed to retry delivery on dead letter ${req.params?.event_id}:`, error);
    if (claimed) {
      // Dispatch threw before recording an outcome — hand the event back to the DLQ.
      await WebhookEvent.releaseManualRetry(event_id).catch(() => {});
    }
    await auditRetry(req, event_id, "error", { message: error.message });
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
