import { randomUUID } from "crypto";

// Header names — kept as constants so requestLogger and correlationId stay in sync
export const CORRELATION_ID_HEADER = "x-correlation-id";
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Assigns every incoming request two identifiers:
 *
 *  correlationId — propagated from the caller via `x-correlation-id` if
 *                  provided, otherwise generated. Useful for tracing a
 *                  single logical operation across multiple services.
 *
 *  requestId     — always freshly generated per request. Uniquely identifies
 *                  this hop even when the same correlationId is reused.
 *
 * Both values are:
 *  - Written onto req so downstream code can read them
 *  - Echoed back in the response headers so clients can correlate logs
 */
export const correlationId = (req, res, next) => {
  const incoming = req.headers[CORRELATION_ID_HEADER];

  // Trust a well-formed UUID from the caller; generate otherwise
  const corrId = incoming && isValidUUID(incoming) ? incoming : randomUUID();

  const reqId = randomUUID();

  req.correlationId = corrId;
  req.requestId = reqId;

  res.setHeader(CORRELATION_ID_HEADER, corrId);
  res.setHeader(REQUEST_ID_HEADER, reqId);

  next();
};

function isValidUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
