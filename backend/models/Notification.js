import db from "../config/database.js";
import NotificationPreference from "./NotificationPreference.js";

const Notification = {
  async create(notificationData) {
    const { user_id, type = "transaction", channel = "push" } = notificationData;
    
    // Check preferences before creating
    const shouldSend = await NotificationPreference.shouldNotify(user_id, type, channel);
    if (!shouldSend) {
      return null;
    }

    const [id] = await db("notifications").insert(notificationData);
    return this.findById(id);
  },

  async findById(id) {
    return await db("notifications")
      .select(
        "notifications.*",
        "users.email as user_email",
        "users.tag as user_tag"
      )
      .leftJoin("users", "notifications.user_id", "users.id")
      .where("notifications.id", id)
      .first();
  },

  async getUnreadByUser(user_id) {
    return await db("notifications").where({ user_id, read: false });
  },

  async getAll(limit = 10, offset = 0) {
    return await db("notifications")
      .select(
        "notifications.*",
        "users.email as user_email",
        "users.tag as user_tag"
      )
      .leftJoin("users", "notifications.user_id", "users.id")
      .limit(limit)
      .offset(offset)
      .orderBy("notifications.created_at", "desc");
  },

  async getByUser(userId, limit = 10, offset = 0) {
    return await db("notifications")
      .select(
        "notifications.*",
        "users.email as user_email",
        "users.tag as user_tag"
      )
      .leftJoin("users", "notifications.user_id", "users.id")
      .where("notifications.user_id", userId)
      .limit(limit)
      .offset(offset)
      .orderBy("notifications.created_at", "desc");
  },

  async update(id, notificationData) {
    await db("notifications")
      .where({ id })
      .update({
        ...notificationData,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async delete(id) {
    return await db("notifications").where({ id }).del();
  },
};

export default Notification;
