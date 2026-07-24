import pino from 'pino';
import { reqSerializer, resSerializer, errSerializer } from './logSerializer.js';
import * as Sentry from '@sentry/node';
import path from 'path';
import fs from 'fs';
import { getCorrelationId, getRequestId } from './asyncContext.js';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';

// Pulled into every log line (via pino's `mixin`) so a request's
// correlationId/requestId show up automatically, even on loggers that were
// never explicitly seeded with them (see utils/asyncContext.js).
function correlationFields() {
  const correlationId = getCorrelationId();
  const requestId = getRequestId();
  const fields = {};
  if (correlationId) fields.correlationId = correlationId;
  if (requestId) fields.requestId = requestId;
  return fields;
}

const logger = pino({
  level: logLevel,
  serializers: {
    req: reqSerializer,
    res: resSerializer,
    err: errSerializer,
  },
  base: {
    env: process.env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: correlationFields,
});

if (process.env.NODE_ENV !== 'production') {
  const pretty = pinoPretty();
  logger.info = ((level) => (data) => {
    if (typeof data === 'object' && data !== null) {
      pretty.write(JSON.stringify({ ...correlationFields(), ...data }) + '\n');
    } else {
      pretty.write(JSON.stringify({ level: 30, msg: data, time: new Date().toISOString(), ...correlationFields() }) + '\n');
    }
  })(logger.info);
}

function pinoPretty() {
  return {
    write(chunk) {
      try {
        const data = JSON.parse(chunk.toString());
        const level = data.level;
        const levelColors = { 30: '\x1b[36m', 40: '\x1b[31m', 50: '\x1b[35m' };
        const color = levelColors[level] || '\x1b[0m';
        const reset = '\x1b[0m';
        const time = data.time ? new Date(data.time).toISOString().replace('T', ' ').slice(0, -1) : '';
        const msg = data.msg || '';
        const err = data.err ? `\n${data.err.stack}` : '';
        console.log(`${color}[${time}] ${level === 30 ? 'INFO' : level === 40 ? 'ERROR' : level === 50 ? 'FATAL' : 'DEBUG'}${reset} ${msg}${err}`);
      } catch (e) {
        console.log(chunk.toString());
      }
    },
  };
}

export const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export const createRequestLogger = (fields = {}) => {
  return logger.child(fields);
};

export default logger;
