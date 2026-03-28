const DEFAULT_REDACT_FIELDS = ['password', 'token', 'secret', 'sendersecret', 'additionalsecrets', 'additionalsigningkeys', 'authorization', 'cookie', 'x-api-key', 'apiKey', 'accessToken', 'refreshToken', 'cvv', 'ssn'];

function getRedactFields() {
  const envFields = process.env.LOG_REDACT_FIELDS;
  if (!envFields) return DEFAULT_REDACT_FIELDS;
  const custom = envFields.split(',').map(f => f.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...DEFAULT_REDACT_FIELDS, ...custom])];
}

function isSensitiveField(key) {
  const lowerKey = key.toLowerCase();
  const redactFields = getRedactFields();
  return redactFields.some(field => lowerKey.includes(field));
}

function sanitizeValue(value) {
  return '[REDACTED]';
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveField(key)) {
      result[key] = sanitizeValue(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeBody(body, depth = 0, maxDepth = 10) {
  if (!body || typeof body !== 'object') return body;
  if (depth >= maxDepth) return '[MAX_DEPTH]';
  if (Array.isArray(body)) return body;
  const result = {};
  for (const [key, value] of Object.entries(body)) {
    if (isSensitiveField(key)) {
      result[key] = sanitizeValue(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeBody(value, depth + 1, maxDepth);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolveBodyForLog(req, maxSize = 10000) {
  const body = req.body;
  if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
    return undefined;
  }
  const sanitized = sanitizeBody(body);
  const str = JSON.stringify(sanitized);
  if (str.length > maxSize) {
    return str.substring(0, maxSize) + '...[TRUNCATED]';
  }
  return sanitized;
}

export { sanitizeHeaders, sanitizeBody, resolveBodyForLog, getRedactFields };
