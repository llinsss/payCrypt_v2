import express from "express";
import * as withdrawalController from "../controllers/withdrawalController.js";
import { handlePaystackWebhook } from "../controllers/webhooks/paystackWebhook.js";
import { handleMonnifyWebhook } from "../controllers/webhooks/monnifyWebhook.js";

const router = express.Router();

// User withdrawal routes (protected by auth middleware in app.js or registered under /api)
/**
 * @swagger
 * /api/withdrawals/initiate:
 *   post:
 *     summary: Post Withdrawals /initiate
 *     tags: [Withdrawals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.post("/initiate", withdrawalController.initiateWithdrawal);
/**
 * @swagger
 * /api/withdrawals/my:
 *   get:
 *     summary: Get Withdrawals /my
 *     tags: [Withdrawals]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.get("/my", withdrawalController.getMyWithdrawals);
/**
 * @swagger
 * /api/withdrawals/{id}:
 *   get:
 *     summary: Get Withdrawals /:id
 *     tags: [Withdrawals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.get("/:id", withdrawalController.getWithdrawalDetails);

// Webhook routes (Public, should not have auth middleware)
/**
 * @swagger
 * /api/withdrawals/webhooks/paystack:
 *   post:
 *     summary: Post Withdrawals /webhooks/paystack
 *     tags: [Withdrawals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.post("/webhooks/paystack", handlePaystackWebhook);
/**
 * @swagger
 * /api/withdrawals/webhooks/monnify:
 *   post:
 *     summary: Post Withdrawals /webhooks/monnify
 *     tags: [Withdrawals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.post("/webhooks/monnify", handleMonnifyWebhook);

export default router;
