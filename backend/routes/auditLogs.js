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
 * tags:
 *   name: Audit Logs
 *   description: Audit trail for all user and admin actions
 */

/**
 * @swagger
 * /api/audit-logs/stats:
 *   get:
 *     summary: Get audit log statistics
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit log statistics
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
 *                     total_logs:
 *                       type: integer
 *                     by_action:
 *                       type: object
 *                     by_resource:
 *                       type: object
 *       401:
 *         description: Unauthorized
 */
router.get("/stats", getAuditLogStats);

/**
 * @swagger
 * /api/audit-logs/cleanup:
 *   delete:
 *     summary: Clean up old audit logs
 *     description: Remove audit logs older than a specified retention period.
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 deleted_count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.delete("/cleanup", cleanupAuditLogs);

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: List audit logs with filtering and pagination
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT]
 *         description: Filter by action type
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource name
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (ISO format)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (ISO format)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_at, action, resource, status_code]
 *           default: created_at
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Paginated list of audit logs
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
 *                       action:
 *                         type: string
 *                         example: "CREATE"
 *                       resource:
 *                         type: string
 *                         example: "transactions"
 *                       user_id:
 *                         type: string
 *                       status_code:
 *                         type: integer
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get("/", validateQuery(auditLogQuerySchema), getAuditLogs);

/**
 * @swagger
 * /api/audit-logs/{id}:
 *   get:
 *     summary: Get a specific audit log entry
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Audit log ID
 *     responses:
 *       200:
 *         description: Audit log entry details
 *       404:
 *         description: Audit log not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", getAuditLogById);

export default router;
