import express from "express";
import { register, login } from "../controllers/authController.js";
import { validate } from "../middleware/validation.js";
import { authSchemas } from "../schemas/auth.js";
import { accountCreationLimiter, loginLimiter } from "../config/rateLimiting.js";

const router = express.Router();

// Apply account creation rate limiter: 5 per hour per IP
router.post("/register", accountCreationLimiter, validate(authSchemas.register), register);

// Apply login rate limiter: 10 failed attempts per 15 minutes
router.post("/login", loginLimiter, validate(authSchemas.login), login);

export default router;
