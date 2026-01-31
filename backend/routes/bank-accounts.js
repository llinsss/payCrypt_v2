import express from "express";
import {
  getBankAccountById,
  updateBankAccount,
  deleteBankAccount,
  getBankAccountByUserId,
} from "../controllers/bankAccountController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * /api/bank-accounts:
 *   get:
 *     summary: Get user's bank accounts
 *     description: Retrieves all bank accounts linked to the authenticated user.
 *     tags: [Bank Accounts]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's bank accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BankAccount'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", authenticate, getBankAccountByUserId);

/**
 * @swagger
 * /api/bank-accounts/{id}:
 *   get:
 *     summary: Get bank account by ID
 *     description: Retrieves a specific bank account by its ID. Users can only view their own bank accounts.
 *     tags: [Bank Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Bank account details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BankAccount'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", authenticate, getBankAccountById);

/**
 * @swagger
 * /api/bank-accounts/{id}:
 *   put:
 *     summary: Update a bank account
 *     description: Updates bank account details. Users can only update their own bank accounts.
 *     tags: [Bank Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bank_name:
 *                 type: string
 *                 example: "GTBank"
 *               account_number:
 *                 type: string
 *                 example: "0123456789"
 *               account_name:
 *                 type: string
 *                 example: "John Doe"
 *               is_default:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Bank account updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BankAccount'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", authenticate, updateBankAccount);

/**
 * @swagger
 * /api/bank-accounts/{id}:
 *   delete:
 *     summary: Delete a bank account
 *     description: Removes a linked bank account. Users can only delete their own bank accounts.
 *     tags: [Bank Accounts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Bank account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Bank account deleted successfully"
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", authenticate, deleteBankAccount);

export default router;
