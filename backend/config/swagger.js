/**
 * Generates OpenAPI `servers` entries from validated deployment configuration.
 *
 * Instead of hardcoding localhost ports and a production hostname, this module
 * derives server URLs from the runtime environment. It honours the
 * `X-Forwarded-Proto` proxy header (via PUBLIC_BASE_URL) and omits development
 * servers when NODE_ENV === "production".
 *
 * @module config/swagger
 * @see https://swagger.io/docs/specification/api-host-and-base-path/
 */

/**
 * Build the `servers` array for swagger-jsdoc.
 *
 * @param {object} [env=process.env] - Environment variables (makes the
 *   function pure and testable).
 * @returns {{ url: string, description: string }[]}
 */
export function buildSwaggerServers(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const port = env.PORT || 5002;
  const publicBaseUrl = (env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

  const servers = [];

  if (nodeEnv === "production") {
    // Production: only expose the validated public URL.
    if (publicBaseUrl) {
      servers.push(
        { url: `${publicBaseUrl}/api/v2`, description: "Production (v2)" },
        { url: `${publicBaseUrl}/api/v1`, description: "Deprecated (v1)" },
      );
    }
  } else {
    // Development / staging: include localhost entries and, when set, the
    // public URL (useful behind ngrok, Cloudflare tunnels, etc.).
    servers.push(
      {
        url: `http://localhost:${port}/api/v2`,
        description: "Development — current version (v2)",
      },
      {
        url: `http://localhost:${port}/api/v1`,
        description: "Development — deprecated (v1)",
      },
      {
        url: `http://localhost:${port}`,
        description: "Development — unversioned root",
      },
    );

    if (publicBaseUrl) {
      servers.push({
        url: `${publicBaseUrl}/api/v2`,
        description: "Staging / tunnel (v2)",
      });
    }
  }

  // Guarantee at least one entry so swagger-ui never shows an empty dropdown.
  if (servers.length === 0) {
    servers.push({
      url: `/api/v2`,
      description: "Relative (v2)",
    });
  }

  return servers;
}
