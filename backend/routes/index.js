import express from "express";
import authRoutes from "./auth.js";
import balancesRoutes from "./balances.js";
import userRoutes from "./users.js";
import kycRoutes from "./kycs.js";
import transactionRoutes from "./transactions.js";
import tokenRoutes from "./tokens.js";
import chainRoutes from "./chains.js";
import walletRoutes from "./wallets.js";
import bankAccountRoutes from "./bank-accounts.js";
import notificationRoutes from "./notifications.js";
const router = express.Router();

router.use("/auth", authRoutes);
router.use("/balances", balancesRoutes);
router.use("/users", userRoutes);
router.use("/kycs", kycRoutes);
router.use("/transactions", transactionRoutes);
router.use("/tokens", tokenRoutes);
router.use("/chains", chainRoutes);
router.use("/wallets", walletRoutes);
router.use("/bank-accounts", bankAccountRoutes);
router.use("/notifications", notificationRoutes);

export default router;