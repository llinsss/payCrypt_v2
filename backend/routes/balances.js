import express from "express";
import {
  createBalance,
  getBalances,
  getBalanceById,
  updateBalance,
  deleteBalance,
  getBalanceByUser,
} from "../controllers/balanceController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { balanceSchema } from "../schemas/balance.js";

const router = express.Router();

router.post("/", authenticate, validate(balanceSchema), createBalance);
router.get("/all", authenticate, getBalances);
router.get("/", authenticate, getBalanceByUser);
router.get("/:id", authenticate, getBalanceById);
router.put("/:id", authenticate, validate(balanceSchema), updateBalance);
router.delete("/:id", authenticate, deleteBalance);

export default router;
