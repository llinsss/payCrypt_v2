import express from "express";
import { getUssdStats, handleUssd } from "../controllers/ussdController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Public endpoint for USSD gateway
/**
 * @swagger
 * /api/ussd/callback:
 *   post:
 *     summary: Post Ussd /callback
 *     tags: [Ussd]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.post("/callback", handleUssd);

// Admin endpoint for stats
/**
 * @swagger
 * /api/ussd/stats:
 *   get:
 *     summary: Get Ussd /stats
 *     tags: [Ussd]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.get("/stats", authenticate, getUssdStats);

export default router;
