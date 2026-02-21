import express from "express";
import * as AnalyticsController from "../controllers/analyticsController.js";
import { authenticate, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Analytics endpoints usually require admin privileges
router.use(authenticate);
router.use(isAdmin);

router.get("/volume", AnalyticsController.getTransactionVolume);
router.get("/average-size", AnalyticsController.getAverageTransactionSize);
router.get("/success-rate", AnalyticsController.getTransactionSuccessRate);
router.get("/user-growth", AnalyticsController.getUserGrowth);
router.get("/time-series", AnalyticsController.getTimeSeriesData);
router.get("/dashboard-summary", AnalyticsController.getDashboardSummary);

export default router;
