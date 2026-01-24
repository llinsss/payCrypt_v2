import db from "../config/database.js";

/**
 * Authenticate using API Key
 * Expected header: x-api-key
 */
export const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({ error: "API key required in x-api-key header" });
    }

    // Find API key in database
    const apiKeyRecord = await db("api_keys")
      .where({ key: apiKey, is_active: true })
      .first();

    if (!apiKeyRecord) {
      return res.status(401).json({ error: "Invalid or inactive API key" });
    }

    // Check if API key has expired
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      return res.status(401).json({ error: "API key has expired" });
    }

    // Update last used timestamp
    await db("api_keys").where({ id: apiKeyRecord.id }).update({
      last_used_at: new Date(),
    });

    // Attach API key record and associated user to request
    req.apiKey = apiKeyRecord;
    req.user = { id: apiKeyRecord.user_id };

    next();
  } catch (error) {
    console.error("API Key authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

/**
 * Optional API Key authentication
 * Allows both JWT and API key, but doesn't require either
 */
export const optionalApiKeyAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const apiKey = req.headers["x-api-key"];

    if (!token && !apiKey) {
      return next(); // Allow unauthenticated requests
    }

    if (apiKey) {
      return authenticateApiKey(req, res, next);
    }

    next();
  } catch (error) {
    console.error("Optional auth error:", error);
    next();
  }
};

/**
 * Verify API key has specific scope/permission
 */
export const requireApiKeyScope = (requiredScopes) => {
  return async (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: "API key authentication required" });
    }

    const scopes = req.apiKey.scopes?.split(",") || [];
    const hasRequiredScope = requiredScopes.some((scope) => scopes.includes(scope));

    if (!hasRequiredScope) {
      return res.status(403).json({
        error: `API key does not have required scope(s): ${requiredScopes.join(", ")}`,
      });
    }

    next();
  };
};

/**
 * Check if API key is from specific IP (if whitelist is set)
 */
export const verifyIpWhitelist = async (req, res, next) => {
  try {
    if (!req.apiKey || !req.apiKey.ip_whitelist) {
      return next();
    }

    const whitelistedIps = req.apiKey.ip_whitelist.split(",").map((ip) => ip.trim());
    const clientIp = req.ip;

    if (!whitelistedIps.includes(clientIp)) {
      return res.status(403).json({
        error: "Request from unauthorized IP address",
      });
    }

    next();
  } catch (error) {
    console.error("IP whitelist verification error:", error);
    res.status(500).json({ error: "IP verification failed" });
  }
};
