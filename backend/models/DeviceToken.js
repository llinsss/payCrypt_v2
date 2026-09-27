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
    return db.transaction(async (trx) => {
      const [deviceToken] = await trx("device_tokens")
        .insert({ user_id, token, platform, active: true })
        .onConflict("token")
        .merge({ user_id, platform, active: true, updated_at: trx.fn.now() })
        .returning("*");
      return deviceToken;
    });
  },

  async deactivateByToken(token) {
    await db("device_tokens")
      .where({ token })
      .update({ active: false, updated_at: db.fn.now() });
  },

  async deactivateByUserAndToken(userId, token) {
    await db("device_tokens")
      .where({ user_id: userId, token })
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
