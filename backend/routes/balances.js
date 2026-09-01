import express from "express";
import {
  createBalance,
  getBalances,
  getBalanceById,
  updateBalance,
  deleteBalance,
  getBalanceByUser,
  updateUserBalance,
  getBalanceByTag,
  getBalanceSummary,
} from "../controllers/balanceController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate, validateParams } from "../middleware/validation.js";
import { balanceCreateSchema, balanceUpdateSchema } from "../schemas/balance.js";
import { numericIdParamSchema } from "../validators/customValidators.js";
import { balanceQueryLimiter } from "../config/rateLimiting.js";
import { privateNoStore } from "../middleware/cacheControl.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Balances
 *   description: User balance management
 */

// Apply balance query rate limiter: 1000 per hour per API key/user

/**
 * @swagger
 * /api/balances:
 *   post:
 *     summary: Create a balance record
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Balance created
 *   get:
 *     summary: Get user balances
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of balances
 */
router.post("/", authenticate, validate(balanceCreateSchema), createBalance);
router.get("/", authenticate, balanceQueryLimiter, privateNoStore, getBalanceByUser);

/**
 * @swagger
 * /api/balances/all:
 *   get:
 *     summary: Get all balances (admin only)
 *     description: Returns a minimal paginated projection of every customer's balances. Requires an authenticated admin user.
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Paginated list of all balances
 *       401:
 *         description: Unauthorized — access token required or invalid
 *       403:
 *         description: Forbidden — admin access required
 */
router.get("/all", authenticate, requireAdmin, balanceQueryLimiter, getBalances);

/**
 * @swagger
 * /api/balances/sync:
 *   post:
 *     summary: Synchronize user balance
 *     description: Idempotently reconciles persisted balances with on-chain balances. Repeating the request converges to the same state.
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance synced
 */
router.post("/sync", authenticate, updateUserBalance);

/**
 * @swagger
 * /api/balances/summary:
 *   get:
 *     summary: Get cross-chain balance summary
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio summary with aggregated USD and NGN values
 */
router.get("/summary", authenticate, balanceQueryLimiter, getBalanceSummary);

/**
 * @swagger
 * /api/balances/{id}:
 *   get:
 *     summary: Get balance by ID
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balance details
 *   put:
 *     summary: Update balance
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balance updated
 *   delete:
 *     summary: Delete balance
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balance deleted
 */
router.get("/:id", authenticate, balanceQueryLimiter, validateParams(numericIdParamSchema), getBalanceById);
router.put("/:id", authenticate, validateParams(numericIdParamSchema), validate(balanceUpdateSchema), updateBalance);
router.delete("/:id", authenticate, validateParams(numericIdParamSchema), deleteBalance);

/**
 * @swagger
 * /api/balances/tag/{tag}:
 *   get:
 *     summary: Get balance by tag
 *     tags: [Balances]
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tag balance
 */
router.get("/tag/:tag", authenticate, balanceQueryLimiter, getBalanceByTag);

export default router;
