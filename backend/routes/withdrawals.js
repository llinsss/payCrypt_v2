import express from "express";
import * as withdrawalController from "../controllers/withdrawalController.js";
import { handlePaystackWebhook } from "../controllers/webhooks/paystackWebhook.js";
import { handleMonnifyWebhook } from "../controllers/webhooks/monnifyWebhook.js";

const router = express.Router();

// User withdrawal routes (protected by auth middleware in app.js or registered under /api)
router.post("/initiate", withdrawalController.initiateWithdrawal);
router.get("/my", withdrawalController.getMyWithdrawals);
router.get("/:id", withdrawalController.getWithdrawalDetails);

// Webhook routes (Public, should not have auth middleware)
router.post("/webhooks/paystack", handlePaystackWebhook);
router.post("/webhooks/monnify", handleMonnifyWebhook);

export default router;
