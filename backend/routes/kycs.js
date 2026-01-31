import express from "express";
import {
  createKyc,
  getKycById,
  updateKyc,
  deleteKyc,
  getKycByUser,
} from "../controllers/kycController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * /api/kycs:
 *   post:
 *     summary: Submit KYC verification
 *     description: Submits a new KYC verification request for the authenticated user.
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - document_type
 *               - document_url
 *             properties:
 *               document_type:
 *                 type: string
 *                 enum: [passport, national_id, drivers_license]
 *                 example: "passport"
 *               document_url:
 *                 type: string
 *                 description: URL of the uploaded document
 *                 example: "https://cloudinary.com/docs/abc123.jpg"
 *               full_name:
 *                 type: string
 *                 example: "John Doe"
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-15"
 *     responses:
 *       201:
 *         description: KYC submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYC'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/", authenticate, createKyc);

/**
 * @swagger
 * /api/kycs:
 *   get:
 *     summary: Get user's KYC status
 *     description: Retrieves the KYC verification status for the authenticated user.
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: KYC details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYC'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/", authenticate, getKycByUser);

/**
 * @swagger
 * /api/kycs/{id}:
 *   get:
 *     summary: Get KYC by ID
 *     description: Retrieves a specific KYC record by its ID.
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: KYC record ID
 *         example: 1
 *     responses:
 *       200:
 *         description: KYC details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYC'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/:id", authenticate, getKycById);

/**
 * @swagger
 * /api/kycs/{id}:
 *   put:
 *     summary: Update KYC record
 *     description: Updates an existing KYC record (e.g., resubmit documents).
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: KYC record ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               document_type:
 *                 type: string
 *                 enum: [passport, national_id, drivers_license]
 *               document_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: KYC updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYC'
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", authenticate, updateKyc);

/**
 * @swagger
 * /api/kycs/{id}:
 *   delete:
 *     summary: Delete KYC record
 *     description: Deletes a KYC verification record.
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: KYC record ID
 *         example: 1
 *     responses:
 *       200:
 *         description: KYC deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "KYC deleted successfully"
 *       400:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", authenticate, deleteKyc);

export default router;
