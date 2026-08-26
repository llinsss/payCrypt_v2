import express from "express";
import { register, login, setup2FA, enable2FA, verify2FA, googleLogin } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { auditLog } from "../middleware/audit.js";
import { authSchemas } from "../schemas/auth.js";
import { rateLimit, strictAuthRateLimit } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User registration, login, and two-factor authentication (2FA)
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new Tagg@d account. Requires email and password. Returns a JWT token on success.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.lagos@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: "StrongP@ssw0rd!"
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Adebayo"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "usr_abc123"
 *                     email:
 *                       type: string
 *                       example: "john.lagos@example.com"
 *                     token:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Validation error
 */
router.post("/register", strictAuthRateLimit("register"), validate(authSchemas.register), auditLog("auth"), register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user and get JWT token
 *     description: Authenticate with email/password. If 2FA is enabled, include the `twoFactorToken`. Returns a JWT bearer token.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.lagos@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "StrongP@ssw0rd!"
 *               twoFactorToken:
 *                 type: string
 *                 example: "123456"
 *                 description: 6-digit OTP from authenticator app (required if 2FA is enabled)
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                           example: "user"
 *       400:
 *         description: Invalid credentials
 *       401:
 *         description: Unauthorized or 2FA token required
 */
router.post("/login", strictAuthRateLimit("login"), validate(authSchemas.login), auditLog("auth"), login);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Login with Google OAuth
 *     description: Authenticate using a Google OAuth token. The token is verified against Google's OAuth API and a Tagg@d JWT is returned.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - googleToken
 *             properties:
 *               googleToken:
 *                 type: string
 *                 example: "ya29.a0AfH6SMB..."
 *                 description: Google OAuth access token obtained from the frontend Google Sign-In flow
 *     responses:
 *       200:
 *         description: Google login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: Invalid Google token
 *       401:
 *         description: Google authentication failed
 */
router.post("/google", rateLimit({ endpointName: "google-login", windowMs: 15 * 60 * 1000, max: 10 }), auditLog("auth"), googleLogin);

/**
 * @swagger
 * /api/auth/2fa/setup:
 *   post:
 *     summary: Set up two-factor authentication
 *     description: Generate a TOTP secret and QR code for enabling 2FA. Returns a base32 secret and a QR code URL for the authenticator app.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup initialized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     secret:
 *                       type: string
 *                       example: "JBSWY3DPEHPK3PXP"
 *                     qrCodeUrl:
 *                       type: string
 *                       example: "otpauth://totp/Tagged:john@example.com?secret=JBSWY3DPEHPK3PXP..."
 *       401:
 *         description: Unauthorized
 */
router.post("/2fa/setup", authenticate, auditLog("auth"), setup2FA);

/**
 * @swagger
 * /api/auth/2fa/enable:
 *   post:
 *     summary: Enable two-factor authentication
 *     description: Confirm 2FA setup by providing the first TOTP code from your authenticator app. After enabling, the `twoFactorToken` will be required for all future logins.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - twoFactorToken
 *             properties:
 *               twoFactorToken:
 *                 type: string
 *                 example: "123456"
 *                 description: 6-digit OTP from the authenticator app
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 *       400:
 *         description: Invalid 2FA token
 *       401:
 *         description: Unauthorized
 */
router.post("/2fa/enable", authenticate, validate(authSchemas.twoFactorToken), auditLog("auth"), enable2FA);

/**
 * @swagger
 * /api/auth/2fa/verify:
 *   post:
 *     summary: Verify a 2FA token
 *     description: Verify a TOTP token from the authenticator app. Used to validate 2FA during sensitive operations like withdrawals.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - twoFactorToken
 *             properties:
 *               twoFactorToken:
 *                 type: string
 *                 example: "654321"
 *     responses:
 *       200:
 *         description: 2FA token verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "2FA token verified"
 *       400:
 *         description: Invalid 2FA token
 *       401:
 *         description: Unauthorized
 */
router.post("/2fa/verify", authenticate, strictAuthRateLimit("twoFactorVerify"), validate(authSchemas.twoFactorToken), auditLog("auth"), verify2FA);

export default router;