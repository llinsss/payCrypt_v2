import db from "../config/database.js";

const Transaction = {
  async create(transactionData) {
    const [id] = await db("transactions").insert(transactionData);
    return this.findById(id);
  },

  async findById(id) {
    return await db("transactions")
      .select("transactions.*", "users.email as email", "users.tag as tag")
      .leftJoin("users", "transactions.user_id", "users.id")
      .where("transactions.id", id)
      .first();
  },

  async getAll(limit = 10, offset = 0) {
    return await db("transactions")
      .select("transactions.*", "users.email as email", "users.tag as tag")
      .leftJoin("users", "transactions.user_id", "users.id")
      .limit(limit)
      .offset(offset)
      .orderBy("transactions.created_at", "desc");
  },

  async getByUser(userId, limit = 10, offset = 0) {
    return await db("transactions")
      .where({ user_id: userId })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async update(id, transactionData) {
    await db("transactions")
      .where({ id })
      .update({
        ...transactionData,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async delete(id) {
    return await db("transactions").where({ id }).del();
  },
};

export default Transaction;
