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

const router = express.Router();

router.post("/", authenticate, validate(transactionSchema), createTransaction);
router.get("/", authenticate, getTransactionByUser);
router.get("/tag/:tag", validateQuery(transactionQuerySchema), getTransactionsByTag);
router.get("/:id", authenticate, getTransactionById);
router.put("/:id", authenticate, validate(transactionSchema), updateTransaction);
router.delete("/:id", authenticate, deleteTransaction);

export default router;
