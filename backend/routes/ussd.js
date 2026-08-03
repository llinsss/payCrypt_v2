import express from "express";
import { getUssdStats, handleUssd } from "../controllers/ussdController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: USSD
 *   description: USSD gateway integration for mobile-based transactions
 */

/**
 * @swagger
 * /api/ussd/callback:
 *   post:
 *     summary: USSD gateway callback
 *     description: Public endpoint that receives USSD session data from the mobile network gateway. Handles menu navigation, balance checks, and payment initiation via USSD codes.
 *     tags: [USSD]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 example: "session_123456"
 *               serviceCode:
 *                 type: string
 *                 example: "*737*42#"
 *               phoneNumber:
 *                 type: string
 *                 example: "08012345678"
 *               text:
 *                 type: string
 *                 example: "1*50*alice"
 *                 description: USSD input text from the user's menu selections
 *     responses:
 *       200:
 *         description: USSD menu response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   example: "CON Enter amount to send:\n"
 *                 action:
 *                   type: string
 *                   example: "prompt"
 */
router.post("/callback", handleUssd);

/**
 * @swagger
 * /api/ussd/stats:
 *   get:
 *     summary: Get USSD usage statistics
 *     description: Returns session counts, active users, and transaction volume via USSD. Admin access required.
 *     tags: [USSD]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: USSD statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalSessions:
 *                       type: integer
 *                       example: 5000
 *                     activeUsers:
 *                       type: integer
 *                       example: 250
 *                     transactionVolume:
 *                       type: number
 *                       example: 150000.0
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get("/stats", authenticate, getUssdStats);

export default router;
