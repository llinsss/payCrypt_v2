import db from "../config/database.js";

const Tag = {
  async create(name, userId) {
    const [id] = await db("tags").insert({
      name,
      user_id: userId
    });

    return this.findById(id);
  },

  async findById(id) {
    return await db("tags")
      .where({ id })
      .first();
  },

  async findByName(name, userId) {
    return await db("tags")
      .where({ name, user_id: userId })
      .first();
  },

  async getByUser(userId) {
    return await db("tags")
      .where({ user_id: userId })
      .orderBy("name", "asc");
  },

  async autocomplete(userId, query) {
    return await db("tags")
      .where("user_id", userId)
      .where("name", "ilike", `%${query}%`)
      .limit(10);
  }
};

export default Tag;