import express from "express";
import {
  profile,
  edit_profile,
  dashboard_summary,
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { editProfileSchema } from "../schemas/user.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profile and dashboard management
 */

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Unauthorized
 */
router.get("/profile", authenticate, profile);
router.post("/profile", authenticate, validate(editProfileSchema), auditLog("users"), edit_profile);

/**
 * @swagger
 * /api/users/dashboard-summary:
 *   get:
 *     summary: Get user dashboard summary
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/dashboard-summary", authenticate, dashboard_summary);

export default router;
