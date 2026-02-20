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

router.get("/stats", getAuditLogStats);

router.delete("/cleanup", cleanupAuditLogs);

router.get("/", validateQuery(auditLogQuerySchema), getAuditLogs);

router.get("/:id", getAuditLogById);

export default router;
