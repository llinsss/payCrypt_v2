import axios from "axios";
import WebhookSignature from "../utils/webhookSignature.js";
import WebhookEvent from "../models/WebhookEvent.js";
import Webhook from "../models/Webhook.js";

const TIMEOUT_MS = 10_000;

/**
 * Custom Backoff intervals (ms)
 * Requirement: [1m, 5m, 15m, 1h, 6h]
 */
const RETRY_INTERVALS = [
  null,               // attempt 0 (initial failed, don't use this index)
  60 * 1000,          // 1. attempt 1  -> wait 1 min
  5 * 60 * 1000,      // 2. attempt 2  -> wait 5 min
  15 * 60 * 1000,     // 3. attempt 3  -> wait 15 min
  60 * 60 * 1000,     // 4. attempt 4  -> wait 1 hour
  6 * 60 * 60 * 1000, // 5. attempt 5  -> wait 6 hours
];

const MAX_RETRIES = 5;

const WebhookDeliveryService = {
  /**
   * Executes the actual HTTP POST transmission.
   * On failure, it transitions the event to the next step, DLQ or Retry.
   */
  async executeDelivery({ eventId, webhookId, payload, url, secret, currentAttempt = 0 }) {
    const signature = WebhookSignature.generateSignature(payload, secret);

    try {
      const response = await axios.post(url, payload, {
        timeout: TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": payload.event,
          "X-Webhook-Delivery": eventId,
        },
      });

      // Mark success
      if (eventId) {
        await WebhookEvent.markSuccess(eventId, response.status, JSON.stringify(response.data)?.substring(0, 1000));
      }
      await Webhook.recordTrigger(webhookId, true);

      console.log(`✅ Webhook ${webhookId} delivered at attempt ${currentAttempt} — status ${response.status}`);
      return true;

    } catch (err) {
      const status = err.response?.status ?? null;
      const errMsg = err.message;
      
      console.error(`💥 Webhook ${webhookId} failed at attempt ${currentAttempt}: ${errMsg}`);
      
      await this.handleFailure({ eventId, webhookId, payload, url, secret, currentAttempt, errMsg, status });
      
      // We throw specifically if this is expected by BullMQ (which it is for basic queues), 
      // but since we are handling retries MANUALLY pushing to the retry queue, we shouldn't throw 
      // to the worker - otherwise BullMQ will trigger its native backoff logic as well!
      // We resolve cleanly so our custom architecture dictates the next flow.
      return false;
    }
  },

  /**
   * Assess a failed delivery. Moves state toward Retry or DLQ.
   */
  async handleFailure({ eventId, webhookId, payload, url, secret, currentAttempt, errMsg, status }) {
    if (!eventId) return; // Cannot track if it was dispatched statelessly
    
    const nextAttempt = currentAttempt + 1;
    
    // Update attempts regardless
    await WebhookEvent.markFailed(eventId, errMsg, status);

    if (nextAttempt > MAX_RETRIES) {
      // Transition to DLQ
      console.error(`⚠️ Webhook event ${eventId} crossed max retries (${MAX_RETRIES}). Transferred to Dead Letter Queue.`);
      await WebhookEvent.markDeadLetter(eventId, errMsg);
      await Webhook.recordTrigger(webhookId, false);
      await Webhook.updateStatus(webhookId, "failed", `Dead letter tracking active: ${errMsg}`);
      return;
    }

    // Schedule retry
    const delayMs = RETRY_INTERVALS[nextAttempt];
    const nextRetryAt = new Date(Date.now() + delayMs);
    
    await WebhookEvent.scheduleRetry(eventId, nextRetryAt);
    
    // Lazy import avoids circular dependency issues
    const { webhookRetryQueue } = await import("../queues/webhookRetry.js");
    
    if (webhookRetryQueue) {
       await webhookRetryQueue.add(
        "retry-deliver",
        {
          webhookId,
          eventId,
          url,
          secret,
          payload,
          attempt: nextAttempt
        },
        { 
          delay: delayMs,
          jobId: `retry-${eventId}-${nextAttempt}`
        }
      );
      console.log(`🕒 Scheduled retry ${nextAttempt} for webhook event ${eventId} in ${delayMs/1000}s`);
    } else {
      console.warn("⚠️ Cannot push webhook onto dead letter / retry queue (Redis inactive)");
    }
  }
};

export default WebhookDeliveryService;
