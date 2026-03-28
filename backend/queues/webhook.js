import { Queue, Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import axios from "axios";
import crypto from "crypto";
import Webhook from "../models/Webhook.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { validateWebhookUrl } from "../utils/validateWebhookUrl.js";

// ========== Queue ==========

export const webhookQueue = redisConnection
  ? new Queue("webhook-delivery", {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    })
  : null;

if (webhookQueue) {
  webhookQueue.on("waiting", (job) =>
    console.log(`⏳ Webhook job ${job} waiting in queue`),
  );
} else {
  console.warn("⚠️ Webhook queue not available (Redis not connected)");
}

// ========== Worker ==========

export const webhookWorker = redisConnection
  ? new Worker(
      "webhook-delivery",
      async (job) => {
        const { webhookId, eventId, url, secret, payload } = job.data;

        // Lazy import to prevent circular issues with dependencies
        const { default: WebhookDeliveryService } = await import("../services/WebhookDeliveryService.js");

        // Re-validate URL at delivery time to catch DNS rebinding attacks
        await validateWebhookUrl(url);

        console.log(`⚙️ Delivering webhook ${webhookId} — event: ${payload.event}`);

        const success = await WebhookDeliveryService.executeDelivery({
          eventId,
          webhookId,
          payload,
          url,
          secret,
          currentAttempt: 0,
        });

        return { success };
      },

      },
      {
        connection: redisConnection,
        concurrency: 10,
      },
    )
  : null;

if (webhookWorker) {
  webhookWorker.on("completed", (job) =>
    console.log(`✅ Webhook worker completed primary job ${job.id}`),
  );
  webhookWorker.on("failed", (job, err) =>
    console.error(`💥 Webhook worker failed primary job ${job?.id}: ${err.message}`),
  );
} else {
  console.warn("⚠️ Webhook worker not available (Redis not connected)");
}
