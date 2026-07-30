import express from "express";
import {
  getNotificationById,
  updateNotification,
  deleteNotification,
  getNotificationByUserId,
  getUnreadNotificationByUserId,
  getPreferences,
  updatePreferences,
  registerDeviceToken,
  unregisterDeviceToken,
} from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Push notification management and preferences
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     description: List all notifications for the authenticated user, sorted by newest first.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       title:
 *                         type: string
 *                         example: "Payment Received"
 *                       body:
 *                         type: string
 *                         example: "You received 50 USDC from @alice"
 *                       type:
 *                         type: string
 *                         example: "payment"
 *                       is_read:
 *                         type: boolean
 *                         example: false
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, getNotificationByUserId);

/**
 * @swagger
 * /api/notifications/unread:
 *   get:
 *     summary: Get unread notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of unread notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       title:
 *                         type: string
 *                       body:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/unread", authenticate, getUnreadNotificationByUserId);

/**
 * @swagger
 * /api/notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     description: Retrieve the user's current notification preferences (push, email, in-app).
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences
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
 *                     push_enabled:
 *                       type: boolean
 *                       example: true
 *                     email_enabled:
 *                       type: boolean
 *                       example: true
 *                     in_app_enabled:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update notification preferences
 *     description: Toggle push, email, or in-app notification channels.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               push_enabled:
 *                 type: boolean
 *                 example: true
 *               email_enabled:
 *                 type: boolean
 *                 example: false
 *               in_app_enabled:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Preferences updated
 *       401:
 *         description: Unauthorized
 */
router.get("/preferences", authenticate, getPreferences);
router.put("/preferences", authenticate, updatePreferences);

/**
 * @swagger
 * /api/notifications/device-token:
 *   post:
 *     summary: Register a push notification device token
 *     description: Register a Firebase Cloud Messaging (FCM) device token for receiving push notifications.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 example: "fcm_device_token_abc123..."
 *               platform:
 *                 type: string
 *                 enum: [android, ios, web]
 *                 example: "android"
 *     responses:
 *       200:
 *         description: Device token registered
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Unregister a push notification device token
 *     description: Remove a device token to stop sending push notifications to that device.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Device token removed
 *       401:
 *         description: Unauthorized
 */
router.post("/device-token", authenticate, registerDeviceToken);
router.delete("/device-token", authenticate, unregisterDeviceToken);
router.post("/device-token/unregister", authenticate, unregisterDeviceToken);

/**
 * @swagger
 * /api/notifications/{id}:
 *   get:
 *     summary: Get a specific notification
 *     tags: [Notifications]
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
 *         description: Notification details
 *       404:
 *         description: Notification not found
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
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
 *         description: Notification updated
 *       404:
 *         description: Notification not found
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
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
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 */
router.get("/:id", authenticate, getNotificationById);
router.put("/:id", authenticate, updateNotification);
router.delete("/:id", authenticate, deleteNotification);

export default router;
