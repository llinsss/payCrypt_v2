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
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Public utility
router.get("/events", getEventTypes);
router.post("/verify", verifySignature);

// Protected routes
router.use(authenticate);

router.post("/", registerWebhook);
router.get("/", getUserWebhooks);
router.get("/:id", getWebhookById);
router.put("/:id", updateWebhook);
router.delete("/:id", deleteWebhook);
router.post("/:id/rotate-secret", rotateSecret);
router.get("/:id/deliveries", getDeliveryHistory);

export default router;
