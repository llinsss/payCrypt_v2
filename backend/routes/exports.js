import express from "express";
import {
  requestExport,
  downloadExport,
  getExportStatus,
} from "../controllers/exportController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateParams } from "../middleware/validation.js";
import {
  exportRequestSchema,
  exportStatusSchema,
} from "../schemas/export.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Exports
 *   description: Transaction export management
 */

/**
 * @swagger
 * /api/exports/request:
 *   post:
 *     summary: Request transaction export
 *     tags: [Exports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - format
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, pdf]
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               type:
 *                 type: string
 *                 enum: [send, receive, swap]
 *               status:
 *                 type: string
 *                 enum: [pending, completed, failed]
 *               tokenId:
 *                 type: number
 *               minAmount:
 *                 type: number
 *               maxAmount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Export generated successfully
 *       202:
 *         description: Export queued for processing
 */
router.post(
  "/request",
  authenticate,
  validate(exportRequestSchema),
  requestExport,
);

/**
 * @swagger
 * /api/exports/download:
 *   get:
 *     summary: Download exported file using one-time token (Issue #501)
 *     tags: [Exports]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Signed JWT download token (one-time use, 24-hour expiry)
 *     responses:
 *       200:
 *         description: File download
 *       400:
 *         description: Missing or invalid token
 *       404:
 *         description: Export not found or expired
 *       410:
 *         description: Token expired or already used (one-time-use violated)
 */
router.get(
  "/download",
  downloadExport,
);

/**
 * @swagger
 * /api/exports/status/{jobId}:
 *   get:
 *     summary: Get export job status
 *     tags: [Exports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job status information
 */
router.get(
  "/status/:jobId",
  authenticate,
  validateParams(exportStatusSchema),
  getExportStatus,
);

export default router;
