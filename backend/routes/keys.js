import express from "express";
import { registerSigningKeys } from "../controllers/keyController.js";
import { authenticate } from "../middleware/auth.js";
import { auditLog } from "../middleware/audit.js";
import { rateLimit } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Signing Keys
 *   description: Blockchain signing key registration for wallet operations
 */

/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Register signing keys for a blockchain wallet
 *     description: Register cryptographic signing keys needed for on-chain transactions on supported chains (Stellar, EVM, Starknet).
 *     tags: [Signing Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stellarPublicKey:
 *                 type: string
 *                 example: "GABCDXYZ1234567890ABCDEF..."
 *                 description: Stellar public key for signing transactions
 *               evmPublicKey:
 *                 type: string
 *                 example: "0x1234567890abcdef1234567890abcdef12345678"
 *                 description: EVM-compatible chain public key
 *               starknetPublicKey:
 *                 type: string
 *                 example: "0x028add5d29f4aa3e4144ba1a85d509de6719e58c..."
 *                 description: Starknet public key
 *     responses:
 *       200:
 *         description: Signing keys registered successfully
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
 *                     registeredChains:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["stellar", "evm", "starknet"]
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  "/",
  authenticate,
  rateLimit({ endpointName: "api" }),
  auditLog("keys"),
  registerSigningKeys,
);

export default router;
