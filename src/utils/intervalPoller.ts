export interface IntervalPollerOptions<T> {
  fetcher: (signal: AbortSignal) => Promise<T>;
  onSuccess: (data: T) => void;
  onError?: (err: unknown) => void;
  intervalMs: number;
}

export interface IntervalPollerHandle {
  stop: () => void;
}

/**
 * Polls `fetcher` on an interval with: single-flight (a tick is skipped if
 * the previous request hasn't settled), abort-on-stop, and stale-response
 * rejection (a response that resolves after `stop()` — or after a newer
 * request has started — is dropped instead of invoking onSuccess/onError).
 */
export function startIntervalPoller<T>(
  options: IntervalPollerOptions<T>
): IntervalPollerHandle {
  let stopped = false;
  let inFlight = false;
  let requestId = 0;
  const controller = new AbortController();

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    const thisRequestId = ++requestId;

    try {
      const data = await options.fetcher(controller.signal);
      if (!stopped && thisRequestId === requestId) {
        options.onSuccess(data);
      }
    } catch (err) {
      if (!stopped && thisRequestId === requestId) {
        options.onError?.(err);
      }
    } finally {
      inFlight = false;
    }
  };

  tick();
  const intervalId = setInterval(tick, options.intervalMs);

  return {
    stop: () => {
      stopped = true;
      controller.abort();
      clearInterval(intervalId);
    },
  };
}
