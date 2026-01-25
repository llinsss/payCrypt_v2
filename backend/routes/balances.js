import express from "express";
import {
  createBalance,
  getBalances,
  getBalanceById,
  updateBalance,
  deleteBalance,
  getBalanceByUser,
  updateUserBalance,
  getBalanceByTag,
} from "../controllers/balanceController.js";
import { authenticate } from "../middleware/auth.js";
import { balanceQueryLimiter } from "../config/rateLimiting.js";

const router = express.Router();

// Apply balance query rate limiter: 1000 per hour per API key/user
router.post("/", authenticate, createBalance);
router.get("/all", authenticate, balanceQueryLimiter, getBalances);
router.get("/", authenticate, balanceQueryLimiter, getBalanceByUser);
router.get("/sync", authenticate, updateUserBalance);
router.get("/:id", authenticate, balanceQueryLimiter, getBalanceById);
router.put("/:id", authenticate, updateBalance);
router.delete("/:id", authenticate, deleteBalance);
router.get("/tag/:tag", balanceQueryLimiter, getBalanceByTag);

export default router;
