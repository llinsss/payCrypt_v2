import express from "express";
import {
  // getUsers,
  // getUserById,
  // updateUser,
  // deleteUser,
  profile,
  edit_profile,
  dashboard_summary,
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     description: Retrieves the authenticated user's profile information including tag, email, and verification status.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/profile", authenticate, profile);

/**
 * @swagger
 * /api/users/dashboard-summary:
 *   get:
 *     summary: Get dashboard summary
 *     description: |
 *       Returns an overview of the user's account including:
 *       total balance, recent deposits, withdrawals, and portfolio growth.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_balance_usd:
 *                       type: string
 *                       example: "1250.50"
 *                     total_deposits:
 *                       type: string
 *                       example: "5000.00"
 *                     total_withdrawals:
 *                       type: string
 *                       example: "3749.50"
 *                     portfolio_growth:
 *                       type: number
 *                       example: 12.5
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/dashboard-summary", authenticate, dashboard_summary);

/**
 * @swagger
 * /api/users/profile:
 *   post:
 *     summary: Update user profile
 *     description: Updates the authenticated user's profile information.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "newemail@example.com"
 *               address:
 *                 type: string
 *                 example: "0xnewaddress..."
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/profile", authenticate, edit_profile);
// router.get("/", authenticate, getUsers);
// router.get("/:id", authenticate, getUserById);
// router.put("/:id", authenticate, updateUser);
// router.delete("/:id", authenticate, deleteUser);

export default router;
