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
import { validate, validateParams } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { sendToTagSchema, sendToWalletSchema, updateWalletSchema } from "../schemas/wallet.js";
import { sendToTagSchema, sendToWalletSchema, walletUpdateSchema } from "../schemas/wallet.js";
import { numericIdParamSchema } from "../validators/customValidators.js";
import { idempotency } from "../middleware/idempotency.js";

const router = express.Router();

router.get("/", authenticate, getWalletByUserId);
router.post("/send-to-tag", authenticate, idempotency, validate(sendToTagSchema), auditLog("wallets"), send_to_tag);
router.post("/send-to-wallet", authenticate, require2FA, idempotency, validate(sendToWalletSchema), auditLog("wallets"), send_to_wallet);
router.get("/:id", authenticate, validateParams(numericIdParamSchema), getWalletById);
router.put("/:id", authenticate, validateParams(numericIdParamSchema), validate(walletUpdateSchema), auditLog("wallets"), updateWallet);
router.delete("/:id", authenticate, validateParams(numericIdParamSchema), auditLog("wallets"), deleteWallet);

export default router;
