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
 *     description: |
 *       Submits Know Your Customer (KYC) verification documents.
 *       Supported document types include passport, national ID, driver's license, and voter's card.
 *       The verification status will be updated after review.
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KYCRequest'
 *           example:
 *             document_type: "national_id"
 *             document_number: "A12345678"
 *             document_front: "https://cloudinary.com/..."
 *             document_back: "https://cloudinary.com/..."
 *             selfie: "https://cloudinary.com/..."
 *     responses:
 *       201:
 *         description: KYC submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYC'
 *             example:
 *               id: 1
 *               user_id: 1
 *               document_type: "national_id"
 *               document_number: "A12345678"
 *               status: "pending"
 *               created_at: "2024-01-15T10:30:00.000Z"
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
 *     description: Retrieves the KYC verification status and documents for the authenticated user
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
 *             example:
 *               id: 1
 *               user_id: 1
 *               document_type: "national_id"
 *               document_number: "A12345678"
 *               status: "approved"
 *               created_at: "2024-01-15T10:30:00.000Z"
 *               updated_at: "2024-01-16T14:00:00.000Z"
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
 *     description: Retrieves a specific KYC record by its ID
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
 *         description: KYC not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *     summary: Update KYC submission
 *     description: Updates KYC verification documents. Only pending submissions can be updated.
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
 *             $ref: '#/components/schemas/KYCRequest'
 *           example:
 *             document_front: "https://cloudinary.com/new-front..."
 *             document_back: "https://cloudinary.com/new-back..."
 *     responses:
 *       200:
 *         description: KYC updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KYC'
 *       400:
 *         description: KYC not found or cannot be updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to update this KYC
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put("/:id", authenticate, updateKyc);

/**
 * @swagger
 * /api/kycs/{id}:
 *   delete:
 *     summary: Delete KYC submission
 *     description: Deletes a KYC submission. Users can only delete their own KYC records.
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
 *         description: KYC not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Unauthorized to delete this KYC
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete("/:id", authenticate, deleteKyc);

export default router;
