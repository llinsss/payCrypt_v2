import * as Sentry from "@sentry/node";

const numericEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
};

export function initSentry() {
  const production = process.env.NODE_ENV === "production";
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    integrations: [Sentry.expressIntegration()],
    tracesSampleRate: numericEnv("SENTRY_TRACES_SAMPLE_RATE", production ? 0.1 : 1),
    profilesSampleRate: numericEnv("SENTRY_PROFILES_SAMPLE_RATE", production ? 0.1 : 1),
  });
}

export function withSentrySpan(name, op, callback, attributes = {}) {
  return Sentry.startSpan({ name, op, attributes }, async (span) => {
    try {
      return await callback();
    } catch (error) {
      span?.setStatus({ code: 2 });
      Sentry.captureException(error);
      throw error;
    }
  });
}

export function instrumentRedisClient(client, clientName = "redis") {
  for (const method of ["get", "set", "setEx", "del", "publish"]) {
    if (typeof client[method] !== "function") continue;
    const original = client[method].bind(client);
    client[method] = (...args) => withSentrySpan(
      `Redis ${method}`,
      "db.redis",
      () => original(...args),
      { "db.system": "redis", "db.operation": method, "redis.client": clientName },
    );
  }
  return client;
}

export function instrumentBullWorker(worker, queueName) {
  const spans = new Map();
  worker.on("active", (job) => {
    spans.set(String(job.id), Sentry.startInactiveSpan({
      name: `BullMQ ${queueName}`,
      op: "queue.process",
      attributes: {
        "messaging.system": "bullmq",
        "messaging.destination.name": queueName,
        "messaging.message.id": String(job.id),
      },
    }));
  });
  const finish = (job, error) => {
    const span = spans.get(String(job?.id));
    if (!span) return;
    if (error) span.setStatus({ code: 2 });
    span.end();
    spans.delete(String(job.id));
  };
  worker.on("completed", (job) => finish(job));
  worker.on("failed", (job, error) => finish(job, error));
  return worker;
}

