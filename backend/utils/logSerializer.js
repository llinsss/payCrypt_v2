import { sanitizeHeaders, resolveBodyForLog } from './redactor.js';

function reqSerializer(req) {
  return {
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    headers: sanitizeHeaders(req.headers),
    query: req.query,
    body: resolveBodyForLog(req),
    ip: req.ip || req.connection?.remoteAddress,
    correlationId: req.correlationId,
    requestId: req.requestId,
  };
}

function resSerializer(res) {
  return {
    statusCode: res.statusCode,
    statusMessage: res.statusMessage,
    headers: res.getHeaders ? res.getHeaders() : {},
  };
}

function errSerializer(err) {
  return {
    type: err.name || 'Error',
    message: err.message,
    stack: err.stack,
    code: err.code,
    statusCode: err.statusCode,
  };
}

function pinoSerializerValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'function') return `[Function: ${value.name}]`;
  if (value instanceof Error) return errSerializer(value);
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(pinoSerializerValue);
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = pinoSerializerValue(v);
    }
    return result;
  }
  return value;
}

export { reqSerializer, resSerializer, errSerializer, pinoSerializerValue };
