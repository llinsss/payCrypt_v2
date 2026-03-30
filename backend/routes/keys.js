import express from "express";
import { registerSigningKeys } from "../controllers/keyController.js";
import { authenticate } from "../middleware/auth.js";
import { auditLog } from "../middleware/audit.js";
import { rateLimit } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post(
  "/",
  authenticate,
  rateLimit({ endpointName: "api" }),
  auditLog("keys"),
  registerSigningKeys,
);

export default router;
