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

/**
 * @swagger
 * tags:
 *   name: KYC
 *   description: Know Your Customer management
 */

/**
 * @swagger
 * /api/kycs:
 *   post:
 *     summary: Create a new KYC record
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: KYC created
 *   get:
 *     summary: Get user's KYC record
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC details
 */
router.post("/", authenticate, validate(kycCreateSchema), createKyc);
router.get("/", authenticate, getKycByUser);

/**
 * @swagger
 * /api/kycs/{id}:
 *   get:
 *     summary: Get KYC by ID
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: KYC details
 *   put:
 *     summary: Update KYC
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: KYC updated
 *   delete:
 *     summary: Delete KYC
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: KYC deleted
 */
router.get("/:id", authenticate, getKycById);
router.put("/:id", authenticate, validate(kycUpdateSchema), updateKyc);
router.delete("/:id", authenticate, deleteKyc);

export default router;
