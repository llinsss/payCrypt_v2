import { Queue, Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import WebhookDeliveryService from "../services/WebhookDeliveryService.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { instrumentBullWorker } from "../observability/sentry.js";
import { buildJobOptions, attachQueueDepthAlert } from "./queueDefaults.js";

// ========== Retry Queue Setup ==========
// Utilizes custom explicit delays managed entirely via the delivery service,
// decoupled from default BullMQ backoffs, to adhere strictly to:
// [1m, 5m, 15m, 1h, 6h]
// attempts:1 keeps BullMQ's own retry/backoff out of the loop since
// WebhookDeliveryService re-enqueues each retry attempt itself.

export const webhookRetryQueue = redisConnection
  ? new Queue("webhook-retry", {
      connection: redisConnection,
      defaultJobOptions: buildJobOptions({
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500, age: 7 * 24 * 60 * 60 }, // Higher limit for tracking failed webhook flows
      }),
    })
  : null;
attachRedisErrorAlert(webhookRetryQueue, "webhook-retry-queue");
attachQueueDepthAlert(webhookRetryQueue, "webhook-retry-queue");

if (webhookRetryQueue) {
  webhookRetryQueue.on("waiting", (job) =>
    console.log(`⏳ Webhook retry job waiting to hit execution: ${job}`),
  );
} else {
  console.warn("⚠️ Webhook retry queue not available (Redis not connected)");
}

// ========== Retry Worker ==========

export const webhookRetryWorker = redisConnection
  ? new Worker(
      "webhook-retry",
      async (job) => {
        // We offload the execution and iteration back to the core Delivery logic
        const { eventId, eventKey, webhookId, payload, url, secret, attempt } = job.data;

        console.log(`⚙️ Executing Webhook Retry (attempt ${attempt}): event ${eventId} for webhook ${webhookId}`);

        // Perform HTTP Request directly or inject back into standard stream
        // to avoid code duplication, WebhookDeliveryService handles the dispatch
        await WebhookDeliveryService.executeDelivery({
          eventId,
          eventKey,
          webhookId,
          payload,
          url,
          secret,
          currentAttempt: attempt
        });
        
        return { success: true, processedAttempt: attempt };
      },
      {
        connection: redisConnection,
        concurrency: 5,
      },
    )
  : null;
attachRedisErrorAlert(webhookRetryWorker, "webhook-retry-worker");

if (webhookRetryWorker) instrumentBullWorker(webhookRetryWorker, "webhook-retry");

if (webhookRetryWorker) {
  webhookRetryWorker.on("completed", (job) =>
    console.log(`✅ Webhook retry worker completed job ${job.id}`),
  );
  webhookRetryWorker.on("failed", (job, err) =>
    console.error(`💥 Webhook retry worker failed job ${job?.id}: ${err.message}`),
  );
}
