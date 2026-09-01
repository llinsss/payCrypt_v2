import express from "express";
import {
  getWalletById,
  updateWallet,
  deleteWallet,
  getWalletByUserId,
  send_to_tag,
  send_to_wallet,
  getAllowances,
} from "../controllers/walletController.js";
import { require2FA } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateParams } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { sendToTagSchema, sendToWalletSchema, walletUpdateSchema } from "../schemas/wallet.js";
import { numericIdParamSchema } from "../validators/customValidators.js";
import { idempotency } from "../middleware/idempotency.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Wallets
 *   description: Wallet management, @tag transfers, and external withdrawals
 */

/**
 * @swagger
 * /api/wallets:
 *   get:
 *     summary: Get the authenticated user's wallets
 *     description: Returns all wallets and balances associated with the authenticated user across all supported chains.
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User wallets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       chain:
 *                         type: string
 *                         example: "stellar"
 *                       address:
 *                         type: string
 *                         example: "GABCDXYZ1234567890..."
 *                       balances:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             token:
 *                               type: string
 *                               example: "USDC"
 *                             amount:
 *                               type: number
 *                               example: 500.0
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, getWalletByUserId);

/**
 * @swagger
 * /api/wallets/send-to-tag:
 *   post:
 *     summary: Send funds to another user via @tag
 *     description: >
 *       Transfer tokens to another registered user's @tag on any supported chain
 *       (base, lisk, flow, u2u, starknet). For Flow, uses Flow EVM (0x + 16 hex chars).
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [receiver_tag, amount, balance_id]
 *             properties:
 *               receiver_tag:
 *                 type: string
 *                 example: "alice"
 *                 description: Recipient's @tag (3-20 alphanumeric/underscore)
 *               amount:
 *                 type: number
 *                 example: 1.5
 *                 description: Amount to send (positive, up to 18 decimal places)
 *               balance_id:
 *                 type: integer
 *                 example: 42
 *                 description: Sender's balance record ID (determines chain + token)
 *     responses:
 *       200:
 *         description: Transfer initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: string
 *                   example: success
 *                 txHash:
 *                   type: string
 *                   example: "0xabc123..."
 *       400:
 *         description: Validation error or missing fields
 *       422:
 *         description: Insufficient balance or transfer failed
 *       429:
 *         description: Another transaction already in progress
 */
router.post("/send-to-tag", authenticate, idempotency, validate(sendToTagSchema), auditLog("wallets"), send_to_tag);

/**
 * @swagger
 * /api/wallets/send-to-wallet:
 *   post:
 *     summary: Send funds to an external blockchain address
 *     description: >
 *       Withdraw tokens to an external wallet address on any supported chain.
 *       Flow EVM addresses must be 0x followed by exactly 16 hex characters
 *       (e.g. 0x1234567890abcdef). Requires 2FA.
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [receiver_address, amount, balance_id]
 *             properties:
 *               receiver_address:
 *                 type: string
 *                 example: "0x1234567890abcdef"
 *                 description: >
 *                   Destination blockchain address. Format depends on chain:
 *                   Flow EVM: 0x + 16 hex chars, EVM chains: 0x + 40 hex chars,
 *                   Starknet: 0x + up to 64 hex chars
 *               amount:
 *                 type: number
 *                 example: 0.5
 *               balance_id:
 *                 type: integer
 *                 example: 42
 *     responses:
 *       200:
 *         description: Withdrawal initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: string
 *                   example: success
 *                 txHash:
 *                   type: string
 *       400:
 *         description: Invalid address format or missing fields
 *       422:
 *         description: Insufficient balance or transfer failed
 */
router.post("/send-to-wallet", authenticate, require2FA, idempotency, validate(sendToWalletSchema), auditLog("wallets"), send_to_wallet);

/**
 * @swagger
 * /api/wallets/{id}:
 *   get:
 *     summary: Get a specific wallet by ID
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Wallet ID
 *     responses:
 *       200:
 *         description: Wallet details
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
 *                     id:
 *                       type: integer
 *                     chain:
 *                       type: string
 *                     address:
 *                       type: string
 *                     balances:
 *                       type: array
 *       404:
 *         description: Wallet not found
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update wallet settings
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 example: "My Stellar Wallet"
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Wallet updated
 *       404:
 *         description: Wallet not found
 *   delete:
 *     summary: Delete a wallet
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Wallet deleted
 *       404:
 *         description: Wallet not found
 */
router.get("/:id", authenticate, validateParams(numericIdParamSchema), getWalletById);
router.put("/:id", authenticate, validateParams(numericIdParamSchema), validate(walletUpdateSchema), auditLog("wallets"), updateWallet);
router.delete("/:id", authenticate, validateParams(numericIdParamSchema), auditLog("wallets"), deleteWallet);

/**
 * @swagger
 * /api/wallets/{address}/allowances:
 *   get:
 *     summary: Get ERC-20 token allowances for a wallet
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Wallet address
 *       - in: query
 *         name: chain
 *         schema:
 *           type: string
 *           enum: [base, lisk, flow, u2u]
 *         description: Optional chain filter
 *     responses:
 *       200:
 *         description: Allowance status for tokens
 */
router.get("/:address/allowances", authenticate, getAllowances);

export default router;
