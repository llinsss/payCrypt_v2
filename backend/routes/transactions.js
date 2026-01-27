import express from "express";
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTransactionByUser,
  getTransactionsByTag,
  processPayment,
  getPaymentLimits,
  getPaymentHistory
} from "../controllers/transactionController.js";
import { authenticate } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validation.js";
import { transactionSchema, transactionQuerySchema } from "../schemas/transaction.js";
import { paymentLimiter } from "../config/rateLimiting.js";

const router = express.Router();

router.get("/", authenticate, getTransactionByUser);
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, getTransactionById);
router.put("/:id", authenticate, paymentLimiter, validate(transactionSchema), updateTransaction);
router.delete("/:id", authenticate, paymentLimiter, deleteTransaction);

// Payment operations
router.post("/payment", authenticate, processPayment);
router.get("/payment/limits", getPaymentLimits);
router.get("/tag/:tag/history", getPaymentHistory);

export default router;
