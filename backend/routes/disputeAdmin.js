import express from "express";
import {
    listDisputes,
    getDisputeDetail,
    updateDispute,
} from "../controllers/disputeAdminController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { disputeQuerySchema, updateDisputeAdminSchema } from "../schemas/dispute.js";

const router = express.Router();

/**
 * Dispute Administration Endpoints
 * All routes require an authenticated admin (authenticate + requireAdmin).
 */

router.get("/", authenticate, requireAdmin, validateQuery(disputeQuerySchema), listDisputes);

router.get("/:id", authenticate, requireAdmin, getDisputeDetail);

router.patch("/:id", authenticate, requireAdmin, validate(updateDisputeAdminSchema), updateDispute);

export default router;
