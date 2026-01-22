import express from "express";
import {
  getWalletById,
  updateWallet,
  deleteWallet,
  getWalletByUserId,
  send_to_tag,
  send_to_wallet,
} from "../controllers/walletController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * /api/wallets:
 *   get:
 *     summary: Get user's wallet
 *     description: Retrieves the wallet information for the authenticated user
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Wallet'
 *             example:
 *               id: 1
 *               user_id: 1
 *               auto_convert_threshold: null
 *               created_at: "2024-01-15T10:30:00.000Z"
 *               updated_at: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Wallet not found"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", authenticate, getWalletByUserId);

/**
 * @swagger
 * /api/wallets/send-to-tag:
 *   post:
 *     summary: Send funds to a user tag
 *     description: |
 *       Transfer cryptocurrency to another user using their tag.
 *       This is the primary method for peer-to-peer transfers within TaggedPay.
 *
 *       **Process:**
 *       1. Validates sender has sufficient balance
 *       2. Executes on-chain transfer via smart contract
 *       3. Creates transaction records for both sender and recipient
 *       4. Sends notifications to both parties
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendToTagRequest'
 *           example:
 *             receiver_tag: "janedoe"
 *             amount: 50.00
 *             balance_id: 1
 *     responses:
 *       200:
 *         description: Transfer successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransferResponse'
 *             example:
 *               data: "success"
 *               txHash: "0xabc123def456789..."
 *       400:
 *         description: Validation error or resource not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingFields:
 *                 summary: Missing required fields
 *                 value:
 *                   error: "Missing required fields"
 *               userNotFound:
 *                 summary: User not found
 *                 value:
 *                   error: "User not found"
 *               recipientNotFound:
 *                 summary: Recipient not found
 *                 value:
 *                   error: "Recipient not found"
 *               selfTransfer:
 *                 summary: Cannot send to self
 *                 value:
 *                   error: "Cannot send to self"
 *               balanceNotFound:
 *                 summary: Balance not found
 *                 value:
 *                   error: "Balance not found"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to use this balance
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Unauthorized"
 *       422:
 *         description: Insufficient balance or transfer failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               insufficientBalance:
 *                 summary: Insufficient balance
 *                 value:
 *                   error: "Insufficient wallet balance"
 *               transferFailed:
 *                 summary: Transfer failed
 *                 value:
 *                   error: "Failed to transfer"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/send-to-tag", authenticate, send_to_tag);

/**
 * @swagger
 * /api/wallets/send-to-wallet:
 *   post:
 *     summary: Send funds to a wallet address
 *     description: |
 *       Transfer cryptocurrency to an external wallet address.
 *       Use this for withdrawals to external wallets or exchanges.
 *
 *       **Process:**
 *       1. Validates sender has sufficient balance
 *       2. Executes on-chain transfer
 *       3. Creates transaction record for sender
 *       4. If recipient is a TaggedPay user, creates transaction record for them too
 *       5. Sends appropriate notifications
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendToWalletRequest'
 *           example:
 *             receiver_address: "0x1234567890abcdef1234567890abcdef12345678"
 *             amount: 25.00
 *             balance_id: 1
 *     responses:
 *       200:
 *         description: Transfer successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransferResponse'
 *             example:
 *               data: "success"
 *               txHash: "0xdef456abc789012..."
 *       400:
 *         description: Validation error or resource not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingFields:
 *                 summary: Missing required fields
 *                 value:
 *                   error: "Missing required fields"
 *               userNotFound:
 *                 summary: User not found
 *                 value:
 *                   error: "User not found"
 *               selfTransfer:
 *                 summary: Cannot send to self
 *                 value:
 *                   error: "Cannot send to self"
 *               balanceNotFound:
 *                 summary: Balance not found
 *                 value:
 *                   error: "Balance not found"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to use this balance
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       422:
 *         description: Insufficient balance or transfer failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               insufficientBalance:
 *                 summary: Insufficient balance
 *                 value:
 *                   error: "Insufficient wallet balance"
 *               transferFailed:
 *                 summary: Transfer failed
 *                 value:
 *                   error: "Failed to transfer"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/send-to-wallet", authenticate, send_to_wallet);

/**
 * @swagger
 * /api/wallets/{id}:
 *   get:
 *     summary: Get wallet by ID
 *     description: Retrieves a specific wallet by its ID
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Wallet ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Wallet details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Wallet'
 *       400:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", authenticate, getWalletById);

/**
 * @swagger
 * /api/wallets/{id}:
 *   put:
 *     summary: Update wallet settings
 *     description: Updates wallet settings. Users can only update their own wallets.
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Wallet ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               auto_convert_threshold:
 *                 type: string
 *                 description: Threshold amount for auto-conversion
 *                 example: "100.00"
 *     responses:
 *       200:
 *         description: Wallet updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Wallet'
 *       400:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to update this wallet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", authenticate, updateWallet);

/**
 * @swagger
 * /api/wallets/{id}:
 *   delete:
 *     summary: Delete a wallet
 *     description: Deletes a wallet. Users can only delete their own wallets.
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Wallet ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Wallet deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Wallet deleted successfully"
 *       400:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to delete this wallet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", authenticate, deleteWallet);

export default router;
