import express from "express";
import { register, login, setup2FA, enable2FA, verify2FA } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { authSchemas } from "../schemas/auth.js";
import { accountCreationLimiter, loginLimiter } from "../config/rateLimiting.js";

const router = express.Router();

router.post("/register", accountCreationLimiter, validate(authSchemas.register), auditLog("auth"), register);

router.post("/login", loginLimiter, validate(authSchemas.login), auditLog("auth"), login);
router.post("/2fa/setup", authenticate, auditLog("auth"), setup2FA);
router.post("/2fa/enable", authenticate, auditLog("auth"), enable2FA);
router.post("/2fa/verify", authenticate, auditLog("auth"), verify2FA);

export default router;
