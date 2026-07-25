import { AsyncLocalStorage } from "node:async_hooks";

// Shared AsyncLocalStorage instance used to propagate the current request's
// correlationId/requestId through any async call chain (services, queues,
// workers) without having to thread them through every function signature.
export const correlationContext = new AsyncLocalStorage();

/**
 * Runs `fn` inside a new async context carrying the given correlationId and
 * requestId. Anything read via getCorrelationId()/getRequestId() during the
 * execution of `fn` (including code it awaits) will see these values.
 */
export function runWithCorrelation(correlationId, requestId, fn) {
  return correlationContext.run({ correlationId, requestId }, fn);
}

export function getCorrelationId() {
  return correlationContext.getStore()?.correlationId ?? null;
}

export function getRequestId() {
  return correlationContext.getStore()?.requestId ?? null;
}
