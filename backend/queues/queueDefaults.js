import logger from "../utils/logger.js";
import * as Sentry from "@sentry/node";

/**
 * Centralized BullMQ retention/backpressure defaults. Individual queues may
 * override specific fields (e.g. attempts, backoff delay) but should always
 * merge on top of these instead of hand-rolling removeOnComplete/removeOnFail.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // 24h
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7d
    count: 5000,
  },
};

// Guards against unbounded job payloads bloating Redis memory / queue depth.
export const MAX_PAYLOAD_BYTES = 256 * 1024; // 256KB

// Depth/age thresholds used to raise backpressure alerts.
export const DEFAULT_DEPTH_ALERT_THRESHOLD = 5000;
export const DEFAULT_OLDEST_JOB_ALERT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_ALERT_INTERVAL_MS = 60 * 1000;

/**
 * Merge queue-specific overrides on top of the shared retention defaults.
 * @param {object} [overrides]
 * @returns {object} defaultJobOptions for a BullMQ Queue
 */
export const buildJobOptions = (overrides = {}) => ({
  ...DEFAULT_JOB_OPTIONS,
  ...overrides,
  backoff: { ...DEFAULT_JOB_OPTIONS.backoff, ...(overrides.backoff || {}) },
  removeOnComplete:
    overrides.removeOnComplete !== undefined
      ? overrides.removeOnComplete
      : DEFAULT_JOB_OPTIONS.removeOnComplete,
  removeOnFail:
    overrides.removeOnFail !== undefined
      ? overrides.removeOnFail
      : DEFAULT_JOB_OPTIONS.removeOnFail,
});

/**
 * Throws if a job payload exceeds MAX_PAYLOAD_BYTES, preventing oversized
 * jobs from bloating Redis and degrading queue throughput.
 * @param {*} data - job data about to be enqueued
 * @param {number} [maxBytes]
 */
export const assertPayloadSize = (data, maxBytes = MAX_PAYLOAD_BYTES) => {
  const size = Buffer.byteLength(JSON.stringify(data ?? {}), "utf8");
  if (size > maxBytes) {
    throw new Error(
      `Job payload of ${size} bytes exceeds the ${maxBytes} byte limit`,
    );
  }
  return size;
};

/**
 * Polls a queue's depth/oldest-waiting-job age on an interval and logs +
 * reports to Sentry when either exceeds the configured thresholds, giving
 * early warning of backpressure before Redis memory or latency degrades.
 * @param {import("bullmq").Queue | null} queue
 * @param {string} label
 * @param {object} [options]
 * @param {number} [options.depthThreshold]
 * @param {number} [options.oldestJobMs]
 * @param {number} [options.intervalMs]
 * @returns {NodeJS.Timeout | null} interval handle (for tests/cleanup)
 */
export const attachQueueDepthAlert = (queue, label, options = {}) => {
  if (!queue) return null;
  const {
    depthThreshold = DEFAULT_DEPTH_ALERT_THRESHOLD,
    oldestJobMs = DEFAULT_OLDEST_JOB_ALERT_MS,
    intervalMs = DEFAULT_ALERT_INTERVAL_MS,
  } = options;

  const checkBackpressure = async () => {
    try {
      const counts = await queue.getJobCounts("waiting", "active", "delayed");
      const depth = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);

      if (depth > depthThreshold) {
        logger.warn(`BullMQ queue depth alert [${label}]`, { depth, depthThreshold });
        Sentry.captureMessage(`Queue depth exceeded threshold [${label}]`, {
          level: "warning",
          tags: { bullmq: label },
          extra: { depth, depthThreshold },
        });
      }

      const [oldestWaiting] = await queue.getJobs(["waiting"], 0, 0);
      if (oldestWaiting) {
        const age = Date.now() - oldestWaiting.timestamp;
        if (age > oldestJobMs) {
          logger.warn(`BullMQ oldest job age alert [${label}]`, { age, oldestJobMs });
          Sentry.captureMessage(`Oldest waiting job exceeded age threshold [${label}]`, {
            level: "warning",
            tags: { bullmq: label },
            extra: { age, oldestJobMs },
          });
        }
      }
    } catch (err) {
      logger.error(`BullMQ backpressure check failed [${label}]`, { error: err.message });
    }
  };

  const interval = setInterval(checkBackpressure, intervalMs);
  interval.unref?.();
  return interval;
};

export default DEFAULT_JOB_OPTIONS;
