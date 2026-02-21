import express from "express";
import { register, login } from "../controllers/authController.js";
import { validate } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { authSchemas } from "../schemas/auth.js";
import { accountCreationLimiter, loginLimiter } from "../config/rateLimiting.js";

const router = express.Router();

router.post("/register", accountCreationLimiter, validate(authSchemas.register), auditLog("auth"), register);

router.post("/login", loginLimiter, validate(authSchemas.login), auditLog("auth"), login);

export default router;
