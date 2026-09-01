import express from "express";
import {
  createToken,
  getTokens,
  getTokenById,
  updateToken,
  deleteToken,
} from "../controllers/tokenController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { publicCache, invalidateCache } from "../middleware/cacheControl.js";
import validate from "../middleware/validate.js";
import { paginationSchema } from "../validators/paginationValidator.js";
import { createTokenSchema, updateTokenSchema } from "../validators/tokenSchemas.js";

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
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: List of tokens
 *       422:
 *         description: Validation error (invalid page or limit)
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
router.post("/", authenticate, requireAdmin, validate(createTokenSchema), invalidateCache("tokens"), createToken);
router.get("/", validate(paginationSchema, "query"), publicCache(3600), getTokens);

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
 *       404:
 *         description: Token not found
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
router.put("/:id", authenticate, requireAdmin, validate(updateTokenSchema), invalidateCache("tokens"), updateToken);
router.delete("/:id", authenticate, requireAdmin, invalidateCache("tokens"), deleteToken);

export default router;