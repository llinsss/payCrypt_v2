import { useEffect, useRef } from "react";
import { apiClient } from "../utils/api";
import { createDebugLogger } from "../utils/debugLog";

// Opt-in and dev-only: import.meta.env.DEV is statically stripped by Vite,
// so this (and the payload it would log) never ships in production bundles.
const debugLog = createDebugLogger(
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_API_LOGGING === "true"
);

/**
 * Custom hook to repeatedly call an API endpoint at a given interval.
 * @param endpoint API endpoint to poll.
 * @param intervalMs Interval in milliseconds (default: 10s).
 */
export function useIntervalApi(endpoint: string, intervalMs = 10_000) {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const fetchData = async () => {
      try {
        const res = await apiClient.get(endpoint);
        if (isMounted.current) {
          debugLog("API call successful:", endpoint, res);
        }
      } catch (err) {
        if (isMounted.current) {
          console.error(
            "API call failed:",
            endpoint,
            err instanceof Error ? err.message : err
          );
        }
      }
    };

    // Initial call and interval
    fetchData();
    const intervalId = setInterval(fetchData, intervalMs);

    // Cleanup
    return () => {
      isMounted.current = false;
      clearInterval(intervalId);
    };
  }, [endpoint, intervalMs]);
}
