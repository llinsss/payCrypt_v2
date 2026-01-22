import express from "express";
import { register, login } from "../controllers/authController.js";
import { validate } from "../middleware/validation.js";
import { authSchemas } from "../schemas/auth.js";

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: |
 *       Creates a new user account with a unique tag for receiving payments.
 *       Upon successful registration, a wallet and bank account are automatically created,
 *       and balance creation is queued for processing.
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             basic:
 *               summary: Basic registration
 *               value:
 *                 tag: "johndoe"
 *                 email: "john@example.com"
 *                 password: "securePassword123"
 *             withAddress:
 *               summary: Registration with wallet address
 *               value:
 *                 tag: "johndoe"
 *                 email: "john@example.com"
 *                 password: "securePassword123"
 *                 address: "0x1234567890abcdef1234567890abcdef12345678"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *             example:
 *               message: "User registered successfully"
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               user:
 *                 id: 1
 *                 tag: "johndoe"
 *                 email: "john@example.com"
 *                 photo: "https://api.dicebear.com/9.x/initials/svg?seed=johndoe"
 *                 kyc_status: "pending"
 *                 created_at: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               emailExists:
 *                 summary: Email already exists
 *                 value:
 *                   error: "User email already exists"
 *               tagExists:
 *                 summary: Tag already exists
 *                 value:
 *                   error: "User tag already exists"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/register", validate(authSchemas.register), register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and get JWT token
 *     description: |
 *       Authenticates a user with email and password credentials.
 *       Returns a JWT token valid for 24 hours that must be included
 *       in the Authorization header for protected endpoints.
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "john@example.com"
 *             password: "securePassword123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *             example:
 *               message: "Login successful"
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               user:
 *                 id: 1
 *                 tag: "johndoe"
 *                 email: "john@example.com"
 *                 photo: "https://api.dicebear.com/9.x/initials/svg?seed=johndoe"
 *                 kyc_status: "pending"
 *                 last_login: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Invalid credentials"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/login", validate(authSchemas.login), login);

export default router;
