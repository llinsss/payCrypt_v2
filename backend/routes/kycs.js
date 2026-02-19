import express from "express";
import {
  createKyc,
  getKycById,
  updateKyc,
  deleteKyc,
  getKycByUser,
} from "../controllers/kycController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { kycCreateSchema, kycUpdateSchema } from "../schemas/kyc.js";

const router = express.Router();

router.post("/", authenticate, validate(kycCreateSchema), createKyc);
router.get("/", authenticate, getKycByUser);
router.get("/:id", authenticate, getKycById);
router.put("/:id", authenticate, validate(kycUpdateSchema), updateKyc);
router.delete("/:id", authenticate, deleteKyc);

export default router;
