import express from "express";
import {
  createKyc,
  getKycById,
  updateKyc,
  deleteKyc,
  getKycByUser,
  getKycStatus,
  approveKyc,
  rejectKyc,
  getKycs,
} from "../controllers/kycController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { kycCreateSchema, kycUpdateSchema } from "../schemas/kyc.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: KYC
 *   description: Know Your Customer (KYC) verification and admin review
 */

/**
 * @swagger
 * /api/kycs:
 *   post:
 *     summary: Submit KYC verification documents
 *     description: Submit identity verification documents (passport, selfie, address proof) for KYC review. Required for withdrawals and higher transaction limits.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idType
 *               - idNumber
 *             properties:
 *               idType:
 *                 type: string
 *                 example: "passport"
 *                 description: Type of ID document (passport, drivers_license, national_id)
 *               idNumber:
 *                 type: string
 *                 example: "A12345678"
 *               idImage:
 *                 type: string
 *                 format: uri
 *                 example: "https://cdn.example.com/john_passport.jpg"
 *               selfieImage:
 *                 type: string
 *                 format: uri
 *               addressProof:
 *                 type: string
 *                 format: uri
 *               country:
 *                 type: string
 *                 example: "NG"
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1990-05-15"
 *     responses:
 *       201:
 *         description: KYC submitted for review
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       example: "pending"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Get current user's KYC record
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC record for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *                     idType:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, validate(kycCreateSchema), createKyc);
router.get("/", authenticate, getKycByUser);

/**
 * @swagger
 * /api/kycs/status:
 *   get:
 *     summary: Get KYC verification status
 *     description: Returns whether the user's KYC is pending, approved, or rejected. Approved KYC is required for bank withdrawals.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *                       example: "approved"
 *                     message:
 *                       type: string
 *                       example: "KYC verification approved"
 *       401:
 *         description: Unauthorized
 */
router.get("/status", authenticate, getKycStatus);

// Admin KYC review queue — lists all submissions (admin & super_admin).
router.get("/admin/all", authenticate, requireAdmin, getKycs);

/**
 * @swagger
 * /api/kycs/{id}:
 *   get:
 *     summary: Get KYC record by ID
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: KYC record details
 *       404:
 *         description: KYC record not found
 *   put:
 *     summary: Update KYC record
 *     description: Update or resubmit KYC documents after rejection.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idType:
 *                 type: string
 *               idNumber:
 *                 type: string
 *               idImage:
 *                 type: string
 *               selfieImage:
 *                 type: string
 *               addressProof:
 *                 type: string
 *     responses:
 *       200:
 *         description: KYC updated
 *   delete:
 *     summary: Delete a KYC record
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: KYC deleted
 */
router.get("/:id", authenticate, getKycById);
router.put("/:id", authenticate, validate(kycUpdateSchema), updateKyc);
router.delete("/:id", authenticate, deleteKyc);

/**
 * @swagger
 * /api/kycs/{id}/approve:
 *   post:
 *     summary: Approve a KYC submission (Admin only)
 *     description: Admin-only endpoint to approve a pending KYC submission, enabling the user to access withdrawals and higher transaction limits.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: KYC record ID to approve
 *     responses:
 *       200:
 *         description: KYC approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       example: "approved"
 *       403:
 *         description: Admin access required
 *       404:
 *         description: KYC record not found
 */
router.post("/:id/approve", authenticate, requireAdmin, approveKyc);

/**
 * @swagger
 * /api/kycs/{id}/reject:
 *   post:
 *     summary: Reject a KYC submission (Admin only)
 *     description: Admin-only endpoint to reject a KYC submission with a reason. The user will be notified and can resubmit.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: KYC record ID to reject
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Document image is blurry. Please resubmit with a clearer photo."
 *     responses:
 *       200:
 *         description: KYC rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       example: "rejected"
 *                     reason:
 *                       type: string
 *       403:
 *         description: Admin access required
 *       404:
 *         description: KYC record not found
 */
router.post("/:id/reject", authenticate, requireAdmin, rejectKyc);

export default router;
