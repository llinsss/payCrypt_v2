import express from "express";
import {
  getNotificationById,
  updateNotification,
  deleteNotification,
  getNotificationByUserId,
  getUnreadNotificationByUserId,
} from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getNotificationByUserId);
router.get("/unread", authenticate, getUnreadNotificationByUserId);
router.get("/:id", authenticate, getNotificationById);
router.put("/:id", authenticate, updateNotification);
router.delete("/:id", authenticate, deleteNotification);

export default router;
