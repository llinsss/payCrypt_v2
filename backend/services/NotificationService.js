import Notification from "../models/Notification.js";
import NotificationPreference from "../models/NotificationPreference.js";
import DeviceToken from "../models/DeviceToken.js";
import { getMessaging } from "./firebase.js";

const NotificationService = {
  async sendPush(userId, title, body, data = {}) {
    const shouldSend = await NotificationPreference.shouldNotify(
      userId,
      data.type || "transaction",
      "push",
    );
    if (!shouldSend) return { sent: false, reason: "preference_blocked" };

    const tokens = await DeviceToken.getUserTokens(userId);
    if (!tokens || tokens.length === 0) {
      return { sent: false, reason: "no_device_tokens" };
    }

    const messaging = getMessaging();
    if (!messaging) {
      return { sent: false, reason: "fcm_not_configured" };
    }

    const message = {
      tokens,
      notification: { title, body },
      data: {
        ...data,
        timestamp: String(Date.now()),
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
      android: {
        notification: {
          sound: "default",
          channelId: "default",
        },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      const successCount = response.successCount;
      const failureCount = response.failureCount;

      if (failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(
              `FCM send failed for token ${idx}:`,
              resp.error?.message,
            );
            if (
              resp.error?.code === "messaging/registration-token-not-registered"
            ) {
              DeviceToken.deactivateByToken(tokens[idx]);
            }
          }
        });
      }

      return { sent: true, successCount, failureCount };
    } catch (error) {
      console.error("FCM send error:", error.message);
      return { sent: false, reason: error.message };
    }
  },

  async sendToUser(userId, title, body, data = {}) {
    const notification = await Notification.create({
      user_id: userId,
      title,
      body,
      type: data.type || "transaction",
      channel: "push",
    });

    const pushResult = await this.sendPush(userId, title, body, data);

    return { notification, push: pushResult };
  },
};

export default NotificationService;
