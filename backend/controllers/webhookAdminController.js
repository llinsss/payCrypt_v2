import WebhookEvent from "../models/WebhookEvent.js";
import WebhookDeliveryService from "../services/WebhookDeliveryService.js";
import Webhook from "../models/Webhook.js";

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

export const retryDeadLetter = async (req, res) => {
  try {
    const { event_id } = req.params;
    
    const event = await WebhookEvent.findById(event_id);
    
    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }
    
    if (event.status !== "dead_letter") {
      return res.status(400).json({ success: false, error: "Event is not currently in the dead letter queue." });
    }

    const webhook = await Webhook.findById(event.webhook_id);
    if (!webhook || !webhook.is_active) {
      return res.status(400).json({ success: false, error: "Target webhook endpoint is inactive or deleted." });
    }
    
    // Parse the JSON payload attached to the event
    let payload;
    try {
      payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
    } catch {
      return res.status(400).json({ success: false, error: "Corrupted event payload, unable to parse." });
    }

    // Resetting status effectively to manual start (treating as attempt 0)
    // Send it immediately through WebhookDeliveryService
    
    console.log(`👨‍💻 Admin manually kicking off dead letter event: ${event.id}`);
    
    const dispatched = await WebhookDeliveryService.executeDelivery({
      eventId: event.id,
      webhookId: webhook.id,
      payload,
      url: webhook.url,
      secret: webhook.secret,
      currentAttempt: 0 
    });

    if (dispatched) {
      return res.status(200).json({ success: true, message: "Dead letter successfully delivered." });
    } else {
      // By returning false, we know it failed immediately but it was securely queued back onto
      // exponential backoff cycle by handleFailure (attempt 1, next step 1 min delay).
      return res.status(202).json({ 
        success: true, 
        message: "Delivery failed again but was successfully re-queued into exponential backoff iteration cycle." 
      });
    }

  } catch (error) {
    console.error(`Failed to retry delivery on dead letter ${req.params?.event_id}:`, error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
