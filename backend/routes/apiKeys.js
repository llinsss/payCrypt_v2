import express from "express";
import {
  createApiKey,
  getApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyStats,
} from "../controllers/apiKeyController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { strictLimiter } from "../config/rateLimiting.js";
import Joi from "joi";

const router = express.Router();

// All API key management routes require authentication
router.use(authenticate);

// Validation schemas
const createApiKeySchema = Joi.object({
  name: Joi.string().required().min(3).max(100),
  scopes: Joi.string().optional().default("read,write"),
  ipWhitelist: Joi.string().optional(),
  expiresIn: Joi.number().optional().min(1).max(365), // days
});

const updateApiKeySchema = Joi.object({
  name: Joi.string().optional().min(3).max(100),
  scopes: Joi.string().optional(),
  ipWhitelist: Joi.string().optional(),
});

// Create new API key (strict rate limiting)
router.post("/", strictLimiter, validate(createApiKeySchema), createApiKey);

// Get all API keys
router.get("/", getApiKeys);

// Get specific API key
router.get("/:keyId", getApiKey);

// Get API key statistics
router.get("/:keyId/stats", getApiKeyStats);

// Update API key
router.patch("/:keyId", validate(updateApiKeySchema), updateApiKey);

// Rotate API key (create new, revoke old)
router.post("/:keyId/rotate", strictLimiter, rotateApiKey);

// Revoke API key
router.delete("/:keyId", revokeApiKey);

export default router;
