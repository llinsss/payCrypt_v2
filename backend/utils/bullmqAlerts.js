import logger from "./logger.js";
import * as Sentry from "@sentry/node";

/**
 * Attaches a connection-error listener to a BullMQ Queue or Worker so Redis
 * connection failures are logged and reported instead of failing silently.
 * @param {import("bullmq").Queue | import("bullmq").Worker | null} instance
 * @param {string} label - identifies the queue/worker in logs and Sentry tags
 */
export const attachRedisErrorAlert = (instance, label) => {
  if (!instance) return;
  instance.on("error", (err) => {
    logger.error(`BullMQ connection error [${label}]`, { error: err.message });
    Sentry.captureException(err, { tags: { bullmq: label } });
  });
};

export default attachRedisErrorAlert;
