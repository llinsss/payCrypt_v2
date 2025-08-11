import express from "express";
import {
  createWallet,
  getWallets,
  getWalletById,
  updateWallet,
  deleteWallet,
  getWalletByUser,
} from "../controllers/walletController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { walletSchema } from "../schemas/wallet.js";

const router = express.Router();

router.post("/", authenticate, validate(walletSchema), createWallet);
router.get("/", authenticate, getWalletByUser);
router.get("/:id", authenticate, getWalletById);
router.put("/:id", authenticate, validate(walletSchema), updateWallet);
router.delete("/:id", authenticate, deleteWallet);

export default router;
