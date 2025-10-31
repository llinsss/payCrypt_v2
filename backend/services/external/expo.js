import axios from "axios";

const EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";

export const sendPushNotification = async (deviceToken, title, body) => {
  if (!deviceToken) return;

  const message = {
    to: deviceToken,
    sound: "default",
    title,
    body,
    data: { timestamp: Date.now() },
  };

  try {
    await axios.post(EXPO_PUSH_API, message, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Expo push error:", err.response?.data || err.message);
  }
};
