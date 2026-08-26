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
 * tags:
 *   name: Bank Accounts
 *   description: Nigerian bank account management for fiat withdrawals
 */

/**
 * @swagger
 * /api/bank-accounts:
 *   get:
 *     summary: Get the authenticated user's linked bank accounts
 *     tags: [Bank Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's bank accounts
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
 *                       bank_name:
 *                         type: string
 *                         example: "GTBank"
 *                       account_number:
 *                         type: string
 *                         example: "0123456789"
 *                       account_name:
 *                         type: string
 *                         example: "John Doe"
 *                       bank_code:
 *                         type: string
 *                         example: "058"
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, getBankAccountByUserId);

/**
 * @swagger
 * /api/bank-accounts/{id}:
 *   get:
 *     summary: Get a specific bank account by ID
 *     tags: [Bank Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bank account ID
 *     responses:
 *       200:
 *         description: Bank account details
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
 *                     bank_name:
 *                       type: string
 *                     account_number:
 *                       type: string
 *                     account_name:
 *                       type: string
 *       404:
 *         description: Bank account not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, getBankAccountById);

/**
 * @swagger
 * /api/bank-accounts/{id}:
 *   put:
 *     summary: Update a bank account
 *     tags: [Bank Accounts]
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
 *               bank_name:
 *                 type: string
 *                 example: "GTBank"
 *               account_number:
 *                 type: string
 *                 example: "0123456789"
 *               account_name:
 *                 type: string
 *                 example: "John Doe"
 *               bank_code:
 *                 type: string
 *                 example: "058"
 *     responses:
 *       200:
 *         description: Bank account updated
 *       404:
 *         description: Bank account not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", authenticate, updateBankAccount);

/**
 * @swagger
 * /api/bank-accounts/{id}:
 *   delete:
 *     summary: Delete a bank account
 *     tags: [Bank Accounts]
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
 *         description: Bank account deleted
 *       404:
 *         description: Bank account not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", authenticate, deleteBankAccount);

export default router;
