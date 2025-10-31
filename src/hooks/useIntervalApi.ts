import { useEffect, useRef } from "react";
import { apiClient } from "../utils/api";

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
          console.log("✅ API call successful:", endpoint, res);
        }
      } catch (err) {
        if (isMounted.current) {
          console.error("❌ API call failed:", err);
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
