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
} from "../controllers/balanceController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { balanceCreateSchema } from "../schemas/balance.js";
import { balanceQueryLimiter } from "../config/rateLimiting.js";

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
router.get("/", authenticate, balanceQueryLimiter, getBalanceByUser);

/**
 * @swagger
 * /api/balances/all:
 *   get:
 *     summary: Get all balances (admin)
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all balances
 */
router.get("/all", authenticate, balanceQueryLimiter, getBalances);

/**
 * @swagger
 * /api/balances/sync:
 *   get:
 *     summary: Sync user balance
 *     tags: [Balances]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance synced
 */
router.get("/sync", authenticate, updateUserBalance);

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
router.get("/:id", authenticate, balanceQueryLimiter, getBalanceById);
router.put("/:id", authenticate, updateBalance);
router.delete("/:id", authenticate, deleteBalance);

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
router.get("/tag/:tag", balanceQueryLimiter, getBalanceByTag);

export default router;
