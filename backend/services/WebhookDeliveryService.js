import axios from "axios";
import WebhookSignature from "../utils/webhookSignature.js";
import WebhookEvent from "../models/WebhookEvent.js";
import Webhook from "../models/Webhook.js";

// Socket inactivity timeout — aborts if no bytes flow for this long (connect,
// waiting for headers, or between response-body chunks).
const TIMEOUT_MS = 10_000;

// Hard ceiling on the whole delivery, including a response that streams bytes
// slowly enough to keep resetting the inactivity timeout above.
const OVERALL_DEADLINE_MS = 15_000;

// Maximum webhook response body we will read. Anything larger is aborted and
// treated as a (non-retryable) delivery failure so a misbehaving endpoint
// cannot exhaust delivery-worker memory.
const MAX_RESPONSE_BYTES = 1_048_576; // 1 MiB

/**
 * Decide whether a failed delivery is worth retrying.
 * - Oversized responses / 4xx (except 429): the endpoint is misbehaving or
 *   rejecting us deterministically — retrying wastes worker capacity.
 * - Timeouts, aborts, network errors, 429 and 5xx: transient — retry.
 */
export function classifyDeliveryFailure(err, status) {
  if (err?.code === "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED") {
    return { retryable: false, reason: "oversized_response" };
  }

  if (
    err?.code === "ERR_CANCELED" ||
    err?.code === "ECONNABORTED" ||
    err?.code === "ETIMEDOUT" ||
    /timeout|aborted/i.test(err?.message || "")
  ) {
    return { retryable: true, reason: "timeout" };
  }

  if (status && status >= 400 && status < 500 && status !== 429) {
    return { retryable: false, reason: `http_${status}` };
  }

  return { retryable: true, reason: status ? `http_${status}` : "network_error" };
}

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
  async executeDelivery({ eventId, eventKey, webhookId, payload, url, secret, currentAttempt = 0 }) {
    const signature = WebhookSignature.generateSignature(payload, secret);

    // Overall deadline: guards against a response that dribbles bytes slowly
    // enough to keep the per-socket inactivity timeout from ever firing.
    const abortController = new AbortController();
    const deadline = setTimeout(() => abortController.abort(), OVERALL_DEADLINE_MS);

    try {
      const response = await axios.post(url, payload, {
        timeout: TIMEOUT_MS,
        signal: abortController.signal,
        maxRedirects: 0,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": payload.event,
          "X-Webhook-Delivery": eventId,
          "X-Webhook-Event-Id": eventKey || eventId,
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
      const { retryable, reason } = classifyDeliveryFailure(err, status);
      const errMsg = err.message;

      console.error(`💥 Webhook ${webhookId} failed at attempt ${currentAttempt}: ${errMsg} [reason=${reason}, retryable=${retryable}]`);

      await this.handleFailure({ eventId, eventKey, webhookId, payload, url, secret, currentAttempt, errMsg, status, retryable });
      
      // We throw specifically if this is expected by BullMQ (which it is for basic queues), 
      // but since we are handling retries MANUALLY pushing to the retry queue, we shouldn't throw 
      // to the worker - otherwise BullMQ will trigger its native backoff logic as well!
      // We resolve cleanly so our custom architecture dictates the next flow.
      return false;
    } finally {
      clearTimeout(deadline);
    }
  },

  /**
   * Assess a failed delivery. Moves state toward Retry or DLQ.
   */
  async handleFailure({ eventId, eventKey, webhookId, payload, url, secret, currentAttempt, errMsg, status, retryable = true }) {
    if (!eventId) return; // Cannot track if it was dispatched statelessly

    const nextAttempt = currentAttempt + 1;

    // Update attempts regardless
    await WebhookEvent.markFailed(eventId, errMsg, status);

    if (!retryable || nextAttempt > MAX_RETRIES) {
      // Transition to DLQ — either the error is non-retryable (oversized
      // response, deterministic 4xx) or we've exhausted the retry budget.
      const cause = retryable
        ? `crossed max retries (${MAX_RETRIES})`
        : "non-retryable failure";
      console.error(`⚠️ Webhook event ${eventId} ${cause}. Transferred to Dead Letter Queue.`);
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
          eventKey,
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
