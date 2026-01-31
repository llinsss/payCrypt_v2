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
 *     summary: Get user's wallets
 *     description: Retrieves all wallets belonging to the authenticated user.
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's wallets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Wallet'
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
 *     summary: Send funds to a @tag
 *     description: |
 *       Transfers funds from the authenticated user's wallet to a recipient identified by their @tag.
 *       Validates the recipient tag exists and the sender has sufficient balance.
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiver_tag
 *               - amount
 *               - balance_id
 *             properties:
 *               receiver_tag:
 *                 type: string
 *                 description: Recipient's @tag
 *                 example: "janedoe"
 *               amount:
 *                 type: number
 *                 description: Amount to send
 *                 example: 50.00
 *               balance_id:
 *                 type: integer
 *                 description: Balance ID to deduct from
 *                 example: 1
 *     responses:
 *       200:
 *         description: Transfer successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transaction:
 *                   $ref: '#/components/schemas/Transaction'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Recipient tag not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Recipient tag not found"
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
 *       Transfers funds from the authenticated user's wallet to a blockchain wallet address.
 *       Validates the wallet address format and sufficient balance.
 *     tags: [Wallets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiver_address
 *               - amount
 *               - balance_id
 *             properties:
 *               receiver_address:
 *                 type: string
 *                 description: Recipient's wallet address
 *                 example: "0xAbCdEf1234567890..."
 *               amount:
 *                 type: number
 *                 description: Amount to send
 *                 example: 25.50
 *               balance_id:
 *                 type: integer
 *                 description: Balance ID to deduct from
 *                 example: 1
 *     responses:
 *       200:
 *         description: Transfer successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transaction:
 *                   $ref: '#/components/schemas/Transaction'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/send-to-wallet", authenticate, send_to_wallet);

/**
 * @swagger
 * /api/wallets/{id}:
 *   get:
 *     summary: Get wallet by ID
 *     description: Retrieves a specific wallet by its ID. Users can only view their own wallets.
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
 *         $ref: '#/components/responses/NotFoundError'
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
 *     summary: Update a wallet
 *     description: Updates wallet details. Users can only update their own wallets.
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
 *               address:
 *                 type: string
 *                 example: "0xNewAddress..."
 *               is_default:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Wallet updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Wallet'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
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
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", authenticate, deleteWallet);

export default router;
