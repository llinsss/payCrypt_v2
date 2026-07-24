import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { getDeadLetters, retryDeadLetter } from "../controllers/webhookAdminController.js";

const router = express.Router();

/**
 * Webhook Administration Endpoints
 * Protected by global admin middleware blocks assuring standard security posture.
 */

// View DLQ list
router.get("/dlq", authenticate, requireAdmin, getDeadLetters);

// Retry a specific DLQ event manually
router.post("/dlq/:event_id/retry", authenticate, requireAdmin, retryDeadLetter);

export default router;
