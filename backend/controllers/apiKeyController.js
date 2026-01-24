import ApiKey from "../models/ApiKey.js";
import db from "../config/database.js";

/**
 * Create new API key for authenticated user
 */
export const createApiKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, scopes, ipWhitelist, expiresIn } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: "API key name is required" });
    }

    // Create API key
    const apiKey = await ApiKey.create(userId, {
      name,
      scopes: scopes || "read,write",
      ipWhitelist,
    });

    // Set expiration if provided (in days)
    if (expiresIn) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresIn));

      await db("api_keys").where({ id: apiKey.id }).update({
        expires_at: expiresAt,
      });
    }

    res.status(201).json({
      message: "API key created successfully",
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key, // Only show once during creation
        scopes: apiKey.scopes,
        ipWhitelist: apiKey.ip_whitelist,
        createdAt: apiKey.created_at,
        expiresAt: apiKey.expires_at,
      },
    });
  } catch (error) {
    console.error("Create API key error:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
};

/**
 * Get all API keys for authenticated user
 */
export const getApiKeys = async (req, res) => {
  try {
    const userId = req.user.id;

    const apiKeys = await ApiKey.findByUserId(userId);

    res.status(200).json({
      count: apiKeys.length,
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        scopes: key.scopes,
        isActive: key.is_active,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        expiresAt: key.expires_at,
      })),
    });
  } catch (error) {
    console.error("Get API keys error:", error);
    res.status(500).json({ error: "Failed to retrieve API keys" });
  }
};

/**
 * Get specific API key details (excluding the key itself)
 */
export const getApiKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;

    const apiKey = await ApiKey.findById(keyId);

    if (!apiKey || apiKey.user_id !== userId) {
      return res.status(404).json({ error: "API key not found" });
    }

    const stats = await ApiKey.getUsageStats(keyId);

    res.status(200).json({
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        scopes: apiKey.scopes,
        ipWhitelist: apiKey.ip_whitelist,
        isActive: apiKey.is_active,
        createdAt: apiKey.created_at,
        lastUsedAt: apiKey.last_used_at,
        expiresAt: apiKey.expires_at,
        stats,
      },
    });
  } catch (error) {
    console.error("Get API key error:", error);
    res.status(500).json({ error: "Failed to retrieve API key" });
  }
};

/**
 * Update API key (name, scopes, IP whitelist)
 */
export const updateApiKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    const { name, scopes, ipWhitelist } = req.body;

    const apiKey = await ApiKey.findById(keyId);

    if (!apiKey || apiKey.user_id !== userId) {
      return res.status(404).json({ error: "API key not found" });
    }

    const updatedKey = await ApiKey.update(keyId, {
      name: name || apiKey.name,
      scopes: scopes || apiKey.scopes,
      ipWhitelist: ipWhitelist || apiKey.ip_whitelist,
    });

    res.status(200).json({
      message: "API key updated successfully",
      apiKey: {
        id: updatedKey.id,
        name: updatedKey.name,
        scopes: updatedKey.scopes,
        ipWhitelist: updatedKey.ip_whitelist,
        createdAt: updatedKey.created_at,
        expiresAt: updatedKey.expires_at,
      },
    });
  } catch (error) {
    console.error("Update API key error:", error);
    res.status(500).json({ error: "Failed to update API key" });
  }
};

/**
 * Revoke/delete API key
 */
export const revokeApiKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;

    const apiKey = await ApiKey.findById(keyId);

    if (!apiKey || apiKey.user_id !== userId) {
      return res.status(404).json({ error: "API key not found" });
    }

    await ApiKey.revoke(keyId);

    res.status(200).json({
      message: "API key revoked successfully",
    });
  } catch (error) {
    console.error("Revoke API key error:", error);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
};

/**
 * Rotate API key (create new one and revoke old)
 */
export const rotateApiKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;

    const apiKey = await ApiKey.findById(keyId);

    if (!apiKey || apiKey.user_id !== userId) {
      return res.status(404).json({ error: "API key not found" });
    }

    const newKey = await ApiKey.rotate(keyId);

    res.status(200).json({
      message: "API key rotated successfully",
      apiKey: {
        id: newKey.id,
        name: newKey.name,
        key: newKey.key, // Only show once during rotation
        scopes: newKey.scopes,
        ipWhitelist: newKey.ip_whitelist,
        createdAt: newKey.created_at,
        expiresAt: newKey.expires_at,
      },
    });
  } catch (error) {
    console.error("Rotate API key error:", error);
    res.status(500).json({ error: "Failed to rotate API key" });
  }
};

/**
 * Get API key usage statistics
 */
export const getApiKeyStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;

    const apiKey = await ApiKey.findById(keyId);

    if (!apiKey || apiKey.user_id !== userId) {
      return res.status(404).json({ error: "API key not found" });
    }

    const stats = await ApiKey.getUsageStats(keyId);

    res.status(200).json({
      stats,
    });
  } catch (error) {
    console.error("Get API key stats error:", error);
    res.status(500).json({ error: "Failed to retrieve API key statistics" });
  }
};
