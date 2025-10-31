import express from "express";
import {
  getWalletById,
  updateWallet,
  deleteWallet,
  getWalletByUserId,
  send_to_tag,
  send_to_wallet,
} from "../controllers/walletController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getWalletByUserId);
router.post("/send-to-tag", authenticate, send_to_tag);
router.post("/send-to-wallet", authenticate, send_to_wallet);
router.get("/:id", authenticate, getWalletById);
router.put("/:id", authenticate, updateWallet);
router.delete("/:id", authenticate, deleteWallet);

export default router;
