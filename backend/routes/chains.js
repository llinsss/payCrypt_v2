import express from "express";
import {
  createChain,
  getChains,
  getChainById,
  updateChain,
  deleteChain,
} from "../controllers/chainController.js";
const router = express.Router();

/**
 * @swagger
 * /api/chains:
 *   post:
 *     summary: Create a new blockchain network
 *     description: Adds a new supported blockchain network to the system
 *     tags: [Chains]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - chain_id
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Ethereum"
 *               chain_id:
 *                 type: integer
 *                 example: 1
 *               rpc_url:
 *                 type: string
 *                 example: "https://mainnet.infura.io/v3/..."
 *               explorer_url:
 *                 type: string
 *                 example: "https://etherscan.io"
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Chain created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chain'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/", createChain);

/**
 * @swagger
 * /api/chains:
 *   get:
 *     summary: Get all supported blockchain networks
 *     description: Retrieves a list of all supported blockchain networks
 *     tags: [Chains]
 *     security: []
 *     responses:
 *       200:
 *         description: List of supported chains
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Chain'
 *             example:
 *               - id: 1
 *                 name: "Ethereum"
 *                 chain_id: 1
 *                 explorer_url: "https://etherscan.io"
 *                 is_active: true
 *               - id: 2
 *                 name: "Starknet"
 *                 chain_id: 0
 *                 explorer_url: "https://starkscan.co"
 *                 is_active: true
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", getChains);

/**
 * @swagger
 * /api/chains/{id}:
 *   get:
 *     summary: Get chain by ID
 *     description: Retrieves a specific blockchain network by its ID
 *     tags: [Chains]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chain ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Chain details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chain'
 *       400:
 *         description: Chain not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", getChainById);

/**
 * @swagger
 * /api/chains/{id}:
 *   put:
 *     summary: Update a chain
 *     description: Updates blockchain network information
 *     tags: [Chains]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chain ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               rpc_url:
 *                 type: string
 *               explorer_url:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *           example:
 *             rpc_url: "https://new-rpc.example.com"
 *             is_active: true
 *     responses:
 *       200:
 *         description: Chain updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chain'
 *       400:
 *         description: Chain not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", updateChain);

/**
 * @swagger
 * /api/chains/{id}:
 *   delete:
 *     summary: Delete a chain
 *     description: Removes a blockchain network from the system
 *     tags: [Chains]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chain ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Chain deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Chain deleted successfully"
 *       400:
 *         description: Chain not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", deleteChain);

export default router;
