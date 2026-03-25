import express from "express";
import {
  getRateLimitSettings,
  getUserRateLimitStatus,
  updateUserTier,
  getApiKeyRateLimit,
  updateApiKeyRateLimit,
} from "../controllers/rateLimitController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

router.get("/settings", getRateLimitSettings);

router.get("/users/:userId", getUserRateLimitStatus);

router.put("/users/:userId/tier", updateUserTier);

router.get("/api-keys/:keyId", getApiKeyRateLimit);

router.put("/api-keys/:keyId/rate-limit", updateApiKeyRateLimit);

export default router;
