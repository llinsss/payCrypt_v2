import express from "express";
import { getPerformanceMetrics, resetPerformanceMetrics } from "../controllers/performanceController.js";
import { authenticate, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Protected routes - only admins can access performance metrics
router.get("/", authenticate, isAdmin, getPerformanceMetrics);
router.post("/reset", authenticate, isAdmin, resetPerformanceMetrics);

export default router;

