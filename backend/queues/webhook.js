import { Queue, Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import axios from "axios";
import crypto from "crypto";
import Webhook from "../models/Webhook.js";
import WebhookEvent from "../models/WebhookEvent.js";

// ========== Queue ==========

export const webhookQueue = redisConnection
  ? new Queue("webhook-delivery", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000, // 1s, 2s, 4s, 8s, 16s
        },
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

const TIMEOUT_MS = 10_000;

const signPayload = (payload, secret) => {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
};

export const webhookWorker = redisConnection
  ? new Worker(
      "webhook-delivery",
      async (job) => {
        const { webhookId, eventId, url, secret, payload } = job.data;

        console.log(`⚙️ Delivering webhook ${webhookId} — event: ${payload.event}`);

        const signature = signPayload(payload, secret);

        try {
          const response = await axios.post(url, payload, {
            timeout: TIMEOUT_MS,
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Signature": `sha256=${signature}`,
              "X-Webhook-Event": payload.event,
              "X-Webhook-Delivery": eventId,
            },
          });

          // Mark event delivered
          if (eventId) {
            await WebhookEvent.markDelivered(eventId, response.status);
          }
          await Webhook.recordTrigger(webhookId, true);

          console.log(`✅ Webhook ${webhookId} delivered — status ${response.status}`);
          return { success: true, status: response.status };
        } catch (err) {
          const status = err.response?.status ?? null;
          const errMsg = err.message;

          if (eventId) {
            await WebhookEvent.markFailed(eventId, errMsg, job.attemptsMade + 1);
          }

          const isLastAttempt = job.attemptsMade + 1 >= job.opts.attempts;
          if (isLastAttempt) {
            await Webhook.recordTrigger(webhookId, false);
            await Webhook.updateStatus(webhookId, "failed", errMsg);
          }

          console.error(
            `💥 Webhook ${webhookId} failed (attempt ${job.attemptsMade + 1}): ${errMsg}`,
          );
          throw err; // re-throw so BullMQ handles retry
        }
      },
      {
        connection: redisConnection,
        concurrency: 10,
      },
    )
  : null;

if (webhookWorker) {
  webhookWorker.on("completed", (job) =>
    console.log(`✅ Webhook worker completed job ${job.id}`),
  );
  webhookWorker.on("failed", (job, err) =>
    console.error(`💥 Webhook worker failed job ${job?.id}: ${err.message}`),
  );
} else {
  console.warn("⚠️ Webhook worker not available (Redis not connected)");
}
