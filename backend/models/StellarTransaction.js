import db from "../config/database.js";

const StellarTransaction = {
  async findByHash(transaction_hash) {
    return await db("stellar_transactions").where({ transaction_hash }).first();
  },

  async findById(id) {
    return await db("stellar_transactions").where({ id }).first();
  },

  async findByAddress(stellar_address, limit = 50, offset = 0) {
    return await db("stellar_transactions")
      .where({ stellar_address })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async findByStatus(status, limit = 100, offset = 0) {
    return await db("stellar_transactions")
      .where({ status })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async create(transactionData) {
    const [id] = await db("stellar_transactions").insert({
      ...transactionData,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning('id');
    return this.findById(id);
  },

  async update(transaction_hash, transactionData) {
    await db("stellar_transactions")
      .where({ transaction_hash })
      .update({
        ...transactionData,
        updated_at: db.fn.now(),
      });
    return this.findByHash(transaction_hash);
  },

  async updateStatus(transaction_hash, status) {
    await db("stellar_transactions")
      .where({ transaction_hash })
      .update({
        status,
        updated_at: db.fn.now(),
      });
    return this.findByHash(transaction_hash);
  },

  async delete(id) {
    return await db("stellar_transactions").where({ id }).del();
  },

  async getIncoming(stellar_address, limit = 50, offset = 0) {
    return await db("stellar_transactions")
      .where({ stellar_address, is_incoming: true })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async getOutgoing(stellar_address, limit = 50, offset = 0) {
    return await db("stellar_transactions")
      .where({ stellar_address, is_incoming: false })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async getByDateRange(stellar_address, startDate, endDate) {
    return await db("stellar_transactions")
      .where({ stellar_address })
      .whereBetween("created_at", [startDate, endDate])
      .orderBy("created_at", "desc");
  },

  async getTotalVolume(stellar_address, asset_code = 'XLM') {
    const result = await db("stellar_transactions")
      .where({ stellar_address, asset_code })
      .sum("amount as total");
    return result[0]?.total || 0;
  },
};

export default StellarTransaction;
