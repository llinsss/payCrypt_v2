import express from "express";
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTransactionByUser,
  getTransactionsByTag,
} from "../controllers/transactionController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

// Apply payment rate limiter: 100 per hour per API key/user
router.post("/", authenticate, paymentLimiter, validate(transactionSchema), createTransaction);
router.get("/", authenticate, getTransactionByUser);
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, getTransactionById);
router.put("/:id", authenticate, paymentLimiter, validate(transactionSchema), updateTransaction);
router.delete("/:id", authenticate, paymentLimiter, deleteTransaction);

export default router;
