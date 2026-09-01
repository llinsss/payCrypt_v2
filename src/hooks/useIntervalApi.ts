import { useEffect } from "react";
import { apiClient } from "../utils/api";
import { startIntervalPoller } from "../utils/intervalPoller";

/**
 * Custom hook to repeatedly call an API endpoint at a given interval.
 * @param endpoint API endpoint to poll.
 * @param intervalMs Interval in milliseconds (default: 10s).
 */
export function useIntervalApi(endpoint: string, intervalMs = 10_000) {
  useEffect(() => {
    const { stop } = startIntervalPoller({
      fetcher: (signal) => apiClient.get(endpoint, { signal }),
      onSuccess: (res) => {
        console.log("✅ API call successful:", endpoint, res);
      },
      onError: (err) => {
        console.error("❌ API call failed:", err);
      },
      intervalMs,
    });

    // Aborts any in-flight request and stops the timer; stale responses
    // that resolve afterward (or after endpoint/intervalMs change and a new
    // effect starts) are dropped by the poller instead of updating state.
    return stop;
  }, [endpoint, intervalMs]);
}
