import express from "express";
import {
  getWalletById,
  updateWallet,
  deleteWallet,
  getWalletByUserId,
  send_to_tag,
  send_to_wallet,
} from "../controllers/walletController.js";
import { require2FA } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { sendToTagSchema, sendToWalletSchema, updateWalletSchema } from "../schemas/wallet.js";
import { idempotency } from "../middleware/idempotency.js";

const router = express.Router();

router.get("/", authenticate, getWalletByUserId);
router.post("/send-to-tag", authenticate, idempotency, validate(sendToTagSchema), auditLog("wallets"), send_to_tag);
router.post("/send-to-wallet", authenticate, require2FA, idempotency, validate(sendToWalletSchema), auditLog("wallets"), send_to_wallet);
router.get("/:id", authenticate, getWalletById);
router.put("/:id", authenticate, validate(updateWalletSchema), auditLog("wallets"), updateWallet);
router.delete("/:id", authenticate, auditLog("wallets"), deleteWallet);

export default router;
