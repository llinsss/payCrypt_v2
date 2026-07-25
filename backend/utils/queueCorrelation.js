import { Queue } from "bullmq";
import { getCorrelationId, getRequestId } from "./asyncContext.js";

// Patches BullMQ's Queue.add so every job enqueued from within a request
// (or from any code running inside runWithCorrelation) automatically carries
// the originating correlationId/requestId in its job data. Individual queue
// modules don't need to know about this — it applies globally, once, here.
//
// Importing this module is side-effect only; it must run before any
// Queue#add() call is made (constructing a Queue instance is fine either
// order — only add() is intercepted).
const originalAdd = Queue.prototype.add;

Queue.prototype.add = function correlatedAdd(name, data = {}, opts) {
  const correlationId = getCorrelationId();

  if (correlationId && data && typeof data === "object" && !Array.isArray(data)) {
    const requestId = getRequestId();
    data = {
      ...data,
      correlationId: data.correlationId ?? correlationId,
      ...(requestId && data.originRequestId === undefined
        ? { originRequestId: requestId }
        : {}),
    };
  }

  return originalAdd.call(this, name, data, opts);
};

export default Queue;
