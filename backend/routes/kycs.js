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
} from "../controllers/kycController.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
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
/**
 * @swagger
 * /api/kycs:
 *   get:
 *     summary: Get Kycs /
 *     tags: [Kycs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.get("/", authenticate, getKycByUser);
router.get("/status", authenticate, getKycStatus);

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
/**
 * @swagger
 * /api/kycs/{id}:
 *   put:
 *     summary: Put Kycs /:id
 *     tags: [Kycs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.put("/:id", authenticate, validate(kycUpdateSchema), updateKyc);
/**
 * @swagger
 * /api/kycs/{id}:
 *   delete:
 *     summary: Delete Kycs /:id
 *     tags: [Kycs]
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
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.delete("/:id", authenticate, deleteKyc);

// Admin-only review routes
/**
 * @swagger
 * /api/kycs/{id}/approve:
 *   post:
 *     summary: Post Kycs /:id/approve
 *     tags: [Kycs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.post("/:id/approve", authenticate, requireAdmin, approveKyc);
/**
 * @swagger
 * /api/kycs/{id}/reject:
 *   post:
 *     summary: Post Kycs /:id/reject
 *     tags: [Kycs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exampleField:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.post("/:id/reject", authenticate, requireAdmin, rejectKyc);

export default router;
