import express from "express";
import { authenticate } from "../middleware/auth.js";
import ReferralService from "../services/ReferralService.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Referrals
 *   description: User referral program management
 */

/**
 * @swagger
 * /api/referrals/stats:
 *   get:
 *     summary: Get referral statistics for authenticated user
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral statistics
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
 *                     referralCode:
 *                       type: string
 *                       example: "ABC12345"
 *                     totalReferrals:
 *                       type: integer
 *                       example: 5
 *                     pendingReferrals:
 *                       type: integer
 *                       example: 2
 *                     referralLink:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/stats", authenticate, async (req, res) => {
  try {
    const stats = await ReferralService.getReferralStats(req.user.id);
    if (!stats) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Failed to get referral stats:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/referrals/history:
 *   get:
 *     summary: Get referral history for authenticated user
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Referral history
 */
router.get("/history", authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 10);
    const page = parseInt(req.query.page || 1);
    const offset = (page - 1) * limit;

    const history = await ReferralService.getReferralHistory(req.user.id, limit, offset);

    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Failed to get referral history:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
