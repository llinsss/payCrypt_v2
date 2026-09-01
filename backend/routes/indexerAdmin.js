import express from "express";
import { getIndexerStatus, resetIndexerBlock } from "../controllers/indexerAdminController.js";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin - Indexer
 *   description: Smart contract event indexer administration
 */

/**
 * @swagger
 * /api/admin/indexer/status:
 *   get:
 *     summary: Get smart contract indexer status
 *     description: Returns the last indexed block per chain and current indexing status
 *     tags: [Admin - Indexer]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Indexer status
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
 *                     base:
 *                       type: object
 *                       properties:
 *                         lastIndexedBlock:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [active, pending]
 *       401:
 *         description: Unauthorized
 */
router.get("/status", getIndexerStatus);

/**
 * @swagger
 * /api/admin/indexer/reset/{chain}:
 *   post:
 *     summary: Reset indexer for a specific chain
 *     description: Resets the last indexed block, causing a full re-index from the beginning
 *     tags: [Admin - Indexer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chain
 *         required: true
 *         schema:
 *           type: string
 *           enum: [base, lisk, flow, u2u]
 *     responses:
 *       200:
 *         description: Indexer reset successfully
 *       400:
 *         description: Invalid chain
 */
router.post("/reset/:chain", resetIndexerBlock);

export default router;
