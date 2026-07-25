import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { listBackups } from "../controllers/backupAdminController.js";

const router = express.Router();

// List recent database backups and their status (local + S3, encryption, size)
router.get("/", authenticate, requireAdmin, listBackups);

export default router;
