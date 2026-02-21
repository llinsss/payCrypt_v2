import db from "../config/database.js";

const NotificationPreference = {
  async findByUserId(userId) {
    return await db("notification_preferences").where({ user_id: userId }).first();
  },

  async create(userId) {
    const [id] = await db("notification_preferences").insert({ user_id: userId });
    return this.findByUserId(userId);
  },

  async update(userId, preferences) {
    await db("notification_preferences")
      .where({ user_id: userId })
      .update({ ...preferences, updated_at: db.fn.now() });
    return this.findByUserId(userId);
  },

  async getOrCreate(userId) {
    let prefs = await this.findByUserId(userId);
    if (!prefs) {
      prefs = await this.create(userId);
    }
    return prefs;
  },

  async shouldNotify(userId, type, channel) {
    const prefs = await this.findByUserId(userId);
    if (!prefs) return true;

    const channelEnabled = prefs[`${channel}_enabled`];
    const typeEnabled = prefs[`${type}_notifications`];
    
    return channelEnabled && typeEnabled;
  },
};

export default NotificationPreference;
