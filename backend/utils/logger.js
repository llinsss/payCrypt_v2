import winston from "winston";
import Transport from "winston-transport";
import "winston-daily-rotate-file";
import path from "path";
import * as Sentry from "@sentry/node";

class SentryTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  log(info, callback) {
    setImmediate(() => this.emit("logged", info));

    const { message, stack, requestId, fingerprint, ...meta } = info;

    const extraMeta = { ...meta };
    delete extraMeta.level;
    delete extraMeta.timestamp;

    Sentry.withScope((scope) => {
      if (requestId) scope.setTag("requestId", requestId);
      if (fingerprint) scope.setFingerprint(fingerprint);

      if (Object.keys(extraMeta).length > 0) {
        scope.setExtra("metadata", extraMeta);
      }

      const err =
        info.error instanceof Error
          ? info.error
          : new Error(message || "Unknown Error");
      if (stack) err.stack = stack;

      Sentry.captureException(err);
    });

    callback();
  }
}

const { combine, timestamp, json, printf, colorize } = winston.format;

const logFormat = printf(
  ({ level, message, timestamp, requestId, ...metadata }) => {
    let msg = `${timestamp} [${level}]`;
    if (requestId) msg += ` [${requestId}]`;
    msg += ` : ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += JSON.stringify(metadata);
    }
    return msg;
  },
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), json()),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: "logs/application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      dirname: path.join(process.cwd(), "logs"),
    }),
    new winston.transports.DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      level: "error",
      dirname: path.join(process.cwd(), "logs"),
    }),
    new winston.transports.DailyRotateFile({
      filename: "logs/performance-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
      level: "info",
      dirname: path.join(process.cwd(), "logs"),
    }),
    new SentryTransport({ level: "error" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        logFormat,
      ),
    }),
  );
}

export const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

/**
 * Create a child logger pre-bound with request-scoped fields.
 * Use this inside middleware and controllers so every log line from a
 * request automatically carries correlationId, requestId, and userId.
 *
 * @param {Object} fields - Key/value pairs to attach to every log entry
 * @returns {winston.Logger} A child logger instance
 *
 * @example
 * const log = createRequestLogger({ correlationId: req.correlationId, requestId: req.requestId });
 * log.info('Payment processed', { amount: 100 });
 */
export const createRequestLogger = (fields = {}) => {
  return logger.child(fields);
};

export default logger;
