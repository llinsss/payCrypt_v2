import express from "express";
import {
  createChain,
  getChains,
  getChainById,
  updateChain,
  deleteChain,
} from "../controllers/chainController.js";
import { publicCache } from "../middleware/cacheControl.js";
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
 *     responses:
 *       201:
 *         description: Chain created successfully
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
 *                     name:
 *                       type: string
 *                     chainId:
 *                       type: string
 *       400:
 *         description: Validation error
 *   get:
 *     summary: List all supported blockchain chains
 *     description: Returns all supported chains with their configuration. Cached for 1 hour.
 *     tags: [Chains]
 *     responses:
 *       200:
 *         description: List of supported chains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: "Stellar"
 *                       chainId:
 *                         type: string
 *                         example: "xlm"
 *                       symbol:
 *                         type: string
 *                         example: "XLM"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 */
router.post("/", createChain);
router.get("/", publicCache(3600), getChains);

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
 *                     name:
 *                       type: string
 *                     chainId:
 *                       type: string
 *                     rpcUrl:
 *                       type: string
 *                     symbol:
 *                       type: string
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
 *               rpcUrl:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Chain updated
 *       404:
 *         description: Chain not found
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
router.put("/:id", updateChain);
router.delete("/:id", deleteChain);

export default router;
