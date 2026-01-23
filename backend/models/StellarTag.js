import db from "../config/database.js";

const StellarTag = {
  async findByTag(tag) {
    return await db("stellar_tags").where({ tag }).first();
  },

  async findByAddress(stellar_address) {
    return await db("stellar_tags").where({ stellar_address }).first();
  },

  async findById(id) {
    return await db("stellar_tags").where({ id }).first();
  },

  async create(tagData) {
    const [id] = await db("stellar_tags").insert({
      ...tagData,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning('id');
    return this.findById(id);
  },

  async update(id, tagData) {
    await db("stellar_tags")
      .where({ id })
      .update({
        ...tagData,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async delete(id) {
    return await db("stellar_tags").where({ id }).del();
  },

  async getAll(limit = 100, offset = 0) {
    return await db("stellar_tags")
      .select("*")
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async search(query, limit = 10) {
    return await db("stellar_tags")
      .where("tag", "like", `%${query}%`)
      .limit(limit)
      .orderBy("created_at", "desc");
  },
};

export default StellarTag;
