import express from "express";
import { register, login, getCurrentUser } from "../controllers/authController.js";
import { validate } from "../middleware/validation.js";
import { authSchemas } from "../schemas/auth.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", validate(authSchemas.register), register);
router.post("/login", validate(authSchemas.login), login);
router.get("/me", authenticate, getCurrentUser);

export default router;
