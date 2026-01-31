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
 *     summary: Create a new chain
 *     description: Registers a new blockchain network on the platform.
 *     tags: [Chains]
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
 *                 default: true
 *     responses:
 *       201:
 *         description: Chain created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chain'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/", createChain);

/**
 * @swagger
 * /api/chains:
 *   get:
 *     summary: Get all chains
 *     description: Retrieves all supported blockchain networks.
 *     tags: [Chains]
 *     responses:
 *       200:
 *         description: List of chains
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Chain'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", getChains);

/**
 * @swagger
 * /api/chains/{id}:
 *   get:
 *     summary: Get chain by ID
 *     description: Retrieves a specific blockchain network by its ID.
 *     tags: [Chains]
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
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", getChainById);

/**
 * @swagger
 * /api/chains/{id}:
 *   put:
 *     summary: Update a chain
 *     description: Updates blockchain network configuration.
 *     tags: [Chains]
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
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Chain updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chain'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", updateChain);

/**
 * @swagger
 * /api/chains/{id}:
 *   delete:
 *     summary: Delete a chain
 *     description: Removes a blockchain network from the platform.
 *     tags: [Chains]
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
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", deleteChain);

export default router;
