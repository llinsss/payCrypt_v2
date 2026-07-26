import express from "express";
import {
  getAuditLogs,
  getAuditLogById,
  getAuditLogStats,
  cleanupAuditLogs,
} from "../controllers/auditLogController.js";
import { authenticate } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validation.js";
import Joi from "joi";

const router = express.Router();

router.use(authenticate);

const auditLogQuerySchema = Joi.object({
  action: Joi.string()
    .valid("CREATE", "READ", "UPDATE", "DELETE", "LOGIN", "LOGOUT")
    .optional(),
  resource: Joi.string().optional().max(100),
  userId: Joi.string().optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  offset: Joi.number().integer().min(0).optional().default(0),
  sortBy: Joi.string()
    .valid("created_at", "action", "resource", "status_code")
    .optional()
    .default("created_at"),
  sortOrder: Joi.string().valid("asc", "desc").optional().default("desc"),
});

/**
 * @swagger
 * /api/auditLogs/stats:
 *   get:
 *     summary: Get Auditlogs /stats
 *     tags: [Auditlogs]
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

router.get("/stats", getAuditLogStats);

/**
 * @swagger
 * /api/auditLogs/cleanup:
 *   delete:
 *     summary: Delete Auditlogs /cleanup
 *     tags: [Auditlogs]
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

router.delete("/cleanup", cleanupAuditLogs);

/**
 * @swagger
 * /api/auditLogs:
 *   get:
 *     summary: Get Auditlogs /
 *     tags: [Auditlogs]
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

router.get("/", validateQuery(auditLogQuerySchema), getAuditLogs);

/**
 * @swagger
 * /api/auditLogs/{id}:
 *   get:
 *     summary: Get Auditlogs /:id
 *     tags: [Auditlogs]
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

router.get("/:id", getAuditLogById);

export default router;
