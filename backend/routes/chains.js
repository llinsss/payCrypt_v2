import express from "express";
import {
  createChain,
  getChains,
  getChainById,
  updateChain,
  deleteChain,
} from "../controllers/chainController.js";
import { publicCache } from "../middleware/cacheControl.js";
import validate from "../middleware/validate.js";
import { paginationSchema } from "../validators/paginationValidator.js";
import { createChainSchema, updateChainSchema } from "../validators/chainSchemas.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chains
 *   description: Blockchain chain configuration and metadata
 */

/**
 * @swagger
 * /api/chains:
 *   post:
 *     summary: Create a new chain configuration
 *     description: Add a new supported blockchain chain to the platform.
 *     tags: [Chains]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - chainId
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Stellar"
 *               chainId:
 *                 type: string
 *                 example: "xlm"
 *               rpcUrl:
 *                 type: string
 *                 example: "https://horizon.stellar.org"
 *               symbol:
 *                 type: string
 *                 example: "XLM"
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               network:
 *                 type: string
 *                 enum: [starknet, base, flow, lisk, u2u, evm, stellar]
 *     responses:
 *       201:
 *         description: Chain created successfully
 *       422:
 *         description: Validation error (invalid or unknown fields)
 *   get:
 *     summary: List all supported blockchain chains
 *     description: Returns all supported chains with their configuration. Cached for 1 hour.
 *     tags: [Chains]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: List of supported chains
 *       422:
 *         description: Validation error (invalid page or limit)
 */
router.post("/", validate(createChainSchema), createChain);
router.get("/", validate(paginationSchema, "query"), publicCache(3600), getChains);

/**
 * @swagger
 * /api/chains/{id}:
 *   get:
 *     summary: Get a specific chain by ID
 *     tags: [Chains]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chain ID
 *     responses:
 *       200:
 *         description: Chain details
 *       404:
 *         description: Chain not found
 *   put:
 *     summary: Update a chain configuration
 *     tags: [Chains]
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
 *               name:
 *                 type: string
 *               chainId:
 *                 type: string
 *               rpcUrl:
 *                 type: string
 *               symbol:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *               network:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chain updated
 *       404:
 *         description: Chain not found
 *       422:
 *         description: Validation error
 *   delete:
 *     summary: Delete a chain configuration
 *     tags: [Chains]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chain deleted
 *       404:
 *         description: Chain not found
 */
router.get("/:id", getChainById);
router.put("/:id", validate(updateChainSchema), updateChain);
router.delete("/:id", deleteChain);

export default router;