import express from "express";
import {
  getEventTypes,
  registerWebhook,
  getUserWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  getDeliveryHistory,
  verifySignature,
} from "../controllers/webhookController.js";
import { authenticateJwtOrApiKey } from "../middleware/auth.js";
import { requireApiKeyScope } from "../middleware/apiKeyAuth.js";
import { validateRegister, validateUpdate } from "../middleware/validateWebhook.js";

const router = express.Router();

// Cap payload size for all webhook routes
router.use(express.json({ limit: "16kb" }));

// Public utility
router.get("/events", getEventTypes);
router.post("/verify", verifySignature);

// Protected routes - JWT or API key with webhooks scope
router.use(authenticateJwtOrApiKey);

router.post("/", validateRegister, requireApiKeyScope(["webhooks:write"]), registerWebhook);
router.get("/", requireApiKeyScope(["webhooks:read"]), getUserWebhooks);
router.get("/:id", requireApiKeyScope(["webhooks:read"]), getWebhookById);
router.put("/:id", validateUpdate, requireApiKeyScope(["webhooks:write"]), updateWebhook);
router.delete("/:id", requireApiKeyScope(["webhooks:write"]), deleteWebhook);
router.post("/:id/rotate-secret", requireApiKeyScope(["webhooks:write"]), rotateSecret);
router.get("/:id/deliveries", requireApiKeyScope(["webhooks:read"]), getDeliveryHistory);

export default router;
