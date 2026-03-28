import express from "express";
import { getUssdStats, handleUssd } from "../controllers/ussdController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Public endpoint for USSD gateway
router.post("/callback", handleUssd);

// Admin endpoint for stats
router.get("/stats", authenticate, getUssdStats);

export default router;
