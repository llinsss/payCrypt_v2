import express from "express";
import {
  getWalletById,
  updateWallet,
  deleteWallet,
  getWalletByUserId,
  deposit,
} from "../controllers/walletController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getWalletByUserId);
router.post("/deposit", authenticate, deposit);
router.get("/:id", authenticate, getWalletById);
router.put("/:id", authenticate, updateWallet);
router.delete("/:id", authenticate, deleteWallet);

export default router;
