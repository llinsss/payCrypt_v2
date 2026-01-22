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
import { balanceQueryLimiter } from "../config/rateLimiting.js";

const router = express.Router();

/**
 * @swagger
 * /api/balances:
 *   post:
 *     summary: Create a new balance record
 *     description: Creates a new balance entry for the authenticated user
 *     tags: [Balances]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token_id:
 *                 type: integer
 *                 description: Token ID
 *                 example: 1
 *               amount:
 *                 type: string
 *                 description: Initial balance amount
 *                 example: "0"
 *               address:
 *                 type: string
 *                 description: Deposit address
 *                 example: "0x1234..."
 *     responses:
 *       201:
 *         description: Balance created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Balance'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/", authenticate, createBalance);

/**
 * @swagger
 * /api/balances/all:
 *   get:
 *     summary: Get all balances (paginated)
 *     description: Retrieves all balance records with pagination support
 *     tags: [Balances]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of all balances
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Balance'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/all", authenticate, balanceQueryLimiter, getBalances);

/**
 * @swagger
 * /api/balances:
 *   get:
 *     summary: Get user's token balances
 *     description: |
 *       Retrieves all token balances for the authenticated user.
 *       Each balance includes:
 *       - Token amount
 *       - USD value
 *       - NGN value (calculated using current exchange rate)
 *       - Deposit address for receiving tokens
 *     tags: [Balances]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's token balances
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Balance'
 *             example:
 *               - id: 1
 *                 user_id: 1
 *                 token_id: 1
 *                 amount: "100.50"
 *                 usd_value: "100.50"
 *                 ngn_value: 160800
 *                 address: "0x1234567890abcdef..."
 *                 token_symbol: "USDT"
 *                 token_name: "Tether USD"
 *                 token_price: 1.0
 *               - id: 2
 *                 user_id: 1
 *                 token_id: 2
 *                 amount: "0.05"
 *                 usd_value: "2250.00"
 *                 ngn_value: 3600000
 *                 address: "0xabcdef1234567890..."
 *                 token_symbol: "ETH"
 *                 token_name: "Ethereum"
 *                 token_price: 45000.0
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", authenticate, balanceQueryLimiter, getBalanceByUser);

/**
 * @swagger
 * /api/balances/sync:
 *   get:
 *     summary: Sync balances with on-chain data
 *     description: |
 *       Synchronizes the user's balances with actual on-chain balances.
 *       This endpoint queries the blockchain for current balances and updates
 *       the database records accordingly.
 *     tags: [Balances]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Balances synchronized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Balances synced successfully"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/sync", authenticate, updateUserBalance);

/**
 * @swagger
 * /api/balances/tag/{tag}:
 *   get:
 *     summary: Get balances by user tag
 *     description: Retrieves token balances for a specific user tag (public endpoint)
 *     tags: [Balances]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: User tag
 *         example: "johndoe"
 *     responses:
 *       200:
 *         description: List of balances for the tag
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Balance'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/tag/:tag", balanceQueryLimiter, getBalanceByTag);

/**
 * @swagger
 * /api/balances/{id}:
 *   get:
 *     summary: Get balance by ID
 *     description: Retrieves a specific balance record by its ID. Users can only view their own balances.
 *     tags: [Balances]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Balance ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Balance details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Balance'
 *       400:
 *         description: Balance not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Balance not found"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to view this balance
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", authenticate, balanceQueryLimiter, getBalanceById);

/**
 * @swagger
 * /api/balances/{id}:
 *   put:
 *     summary: Update a balance
 *     description: Updates a balance record. Users can only update their own balances.
 *     tags: [Balances]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Balance ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: string
 *                 example: "150.00"
 *               usd_value:
 *                 type: string
 *                 example: "150.00"
 *               auto_convert_threshold:
 *                 type: string
 *                 example: "100.00"
 *     responses:
 *       200:
 *         description: Balance updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Balance'
 *       400:
 *         description: Balance not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to update this balance
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", authenticate, updateBalance);

/**
 * @swagger
 * /api/balances/{id}:
 *   delete:
 *     summary: Delete a balance
 *     description: Deletes a balance record. Users can only delete their own balances.
 *     tags: [Balances]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Balance ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Balance deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Balance deleted successfully"
 *       400:
 *         description: Balance not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to delete this balance
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", authenticate, deleteBalance);

export default router;
