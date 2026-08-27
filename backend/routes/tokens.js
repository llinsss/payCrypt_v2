import express from "express";
import {
  createToken,
  getTokens,
  getTokenById,
  updateToken,
  deleteToken,
} from "../controllers/tokenController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { publicCache } from "../middleware/cacheControl.js";
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tokens
 *   description: Crypto token management
 */

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Get all tokens
 *     tags: [Tokens]
 *     responses:
 *       200:
 *         description: List of tokens
 *   post:
 *     summary: Create a new token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     description: Requires an authenticated admin (bearer token with role admin or super_admin).
 *     responses:
 *       201:
 *         description: Token created
 *       401:
 *         description: Access token required
 *       403:
 *         description: Admin access required
 */
router.post("/", authenticate, requireAdmin, createToken);
router.get("/", publicCache(3600), getTokens);

/**
 * @swagger
 * /api/tokens/{id}:
 *   get:
 *     summary: Get token by ID
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token details
 *   put:
 *     summary: Update token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     description: Requires an authenticated admin (bearer token with role admin or super_admin).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token updated
 *       401:
 *         description: Access token required
 *       403:
 *         description: Admin access required
 *   delete:
 *     summary: Delete token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     description: Requires an authenticated admin (bearer token with role admin or super_admin).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token deleted
 *       401:
 *         description: Access token required
 *       403:
 *         description: Admin access required
 */
router.get("/:id", getTokenById);
router.put("/:id", authenticate, requireAdmin, updateToken);
router.delete("/:id", authenticate, requireAdmin, deleteToken);

export default router;
