const WS_URL_PATTERN = /^wss?:\/\/.+/i;

/**
 * Resolves and validates the app's WebSocket endpoint from a raw env value.
 * Throws a descriptive error instead of silently falling back so misconfigured
 * deployments fail visibly rather than attempting an insecure/mixed-content connection.
 */
export function resolveWebSocketUrl(rawUrl: string | undefined): string {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error(
      "VITE_WS_URL is not set. Define it in your environment (see .env.example) before starting the app."
    );
  }

  const url = rawUrl.trim();

  if (!WS_URL_PATTERN.test(url)) {
    throw new Error(
      `VITE_WS_URL must start with ws:// or wss:// (received "${url}").`
    );
  }

  return url;
}
