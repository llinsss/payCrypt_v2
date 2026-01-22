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
 *     summary: Get current user profile
 *     description: Retrieves the profile information of the authenticated user
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Profile fetched"
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *             example:
 *               message: "Profile fetched"
 *               user:
 *                 id: 1
 *                 tag: "johndoe"
 *                 email: "john@example.com"
 *                 photo: "https://api.dicebear.com/9.x/initials/svg?seed=johndoe"
 *                 kyc_status: "pending"
 *                 created_at: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "User not found"
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
 *     summary: Get dashboard summary statistics
 *     description: |
 *       Retrieves aggregated financial summary for the user's dashboard including:
 *       - Total balance across all tokens (in USD)
 *       - Total deposits received
 *       - Total withdrawals made
 *       - Portfolio growth percentage
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardSummary'
 *             example:
 *               total_balance: 1250.50
 *               total_deposit: 5000.00
 *               total_withdrawal: 3749.50
 *               portfolio_growth: 0
 *       400:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *     description: Updates the authenticated user's profile information
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
 *               tag:
 *                 type: string
 *                 description: User's unique tag
 *                 example: "johndoe_updated"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "newemail@example.com"
 *               photo:
 *                 type: string
 *                 description: URL to profile photo
 *                 example: "https://example.com/photo.jpg"
 *               address:
 *                 type: string
 *                 description: Wallet address
 *           example:
 *             tag: "johndoe_updated"
 *             photo: "https://example.com/newphoto.jpg"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *             example:
 *               id: 1
 *               tag: "johndoe_updated"
 *               email: "john@example.com"
 *               photo: "https://example.com/newphoto.jpg"
 *               kyc_status: "pending"
 *               updated_at: "2024-01-15T12:00:00.000Z"
 *       400:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
