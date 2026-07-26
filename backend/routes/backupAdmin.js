import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { listBackups } from "../controllers/backupAdminController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Backup Admin
 *   description: Database backup management for administrators
 */

/**
 * @swagger
 * /api/admin/backups:
 *   get:
 *     summary: List recent database backups
 *     description: Returns a list of recent database backups including local and S3 storage, encryption status, and file sizes. Admin access required.
 *     tags: [Backup Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of backups
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
 *                       filename:
 *                         type: string
 *                         example: "backup_2025_01_15_0300.sql.gz"
 *                       size:
 *                         type: number
 *                         example: 5242880
 *                         description: File size in bytes
 *                       encrypted:
 *                         type: boolean
 *                         example: true
 *                       location:
 *                         type: string
 *                         enum: [local, s3]
 *                         example: "s3"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get("/", authenticate, requireAdmin, listBackups);

export default router;
