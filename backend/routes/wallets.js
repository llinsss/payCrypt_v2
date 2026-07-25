import express from "express";
import {
  getWalletById,
  updateWallet,
  deleteWallet,
  getWalletByUserId,
  send_to_tag,
  send_to_wallet,
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
router.get("/", authenticate, getWalletByUserId);

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
router.post("/send-to-tag", authenticate, idempotency, validate(sendToTagSchema), auditLog("wallets"), send_to_tag);
router.post("/send-to-wallet", authenticate, require2FA, idempotency, validate(sendToWalletSchema), auditLog("wallets"), send_to_wallet);
router.get("/:id", authenticate, validateParams(numericIdParamSchema), getWalletById);
router.put("/:id", authenticate, validateParams(numericIdParamSchema), validate(walletUpdateSchema), auditLog("wallets"), updateWallet);
router.delete("/:id", authenticate, validateParams(numericIdParamSchema), auditLog("wallets"), deleteWallet);

export default router;
