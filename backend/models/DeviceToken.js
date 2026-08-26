import db from "../config/database.js";

const DeviceToken = {
  async findByUserId(userId) {
    return await db("device_tokens").where({ user_id: userId, active: true });
  },

  async findByToken(token) {
    return await db("device_tokens").where({ token }).first();
  },

  async create(data) {
    const { user_id, token, platform } = data;
    const existing = await db("device_tokens")
      .where({ user_id, token })
      .first();

    if (existing) {
      await db("device_tokens")
        .where({ id: existing.id })
        .update({ active: true, platform, updated_at: db.fn.now() });
      return this.findByUserId(userId);
    }

    const [id] = await db("device_tokens").insert({
      user_id,
      token,
      platform,
      active: true,
    });
    return this.findByUserId(userId);
  },

  async deactivateByToken(token) {
    await db("device_tokens")
      .where({ token })
      .update({ active: false, updated_at: db.fn.now() });
  },

  async deactivateByUser(userId) {
    await db("device_tokens")
      .where({ user_id: userId })
      .update({ active: false, updated_at: db.fn.now() });
  },

  async getUserTokens(userId) {
    const tokens = await db("device_tokens")
      .where({ user_id: userId, active: true })
      .select("token", "platform");
    return tokens.map((t) => t.token);
  },

  async delete(id) {
    return await db("device_tokens").where({ id }).del();
  },
};

export default DeviceToken;
