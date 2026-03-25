import db from "../config/database.js";
import Transaction from "./Transaction.js";

const BatchPayment = {
  async create(batchData, trx = null) {
    const query = trx || db;
    const inserted = await query("payment_batches").insert(batchData).returning("id");
    const id = Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted;
    return this.findById(id, trx);
  },

  async findById(id, trx = null) {
    const query = trx || db;
    return await query("payment_batches").where({ id }).first();
  },

  async findByIdForUser(id, userId) {
    return await db("payment_batches")
      .where({ id, user_id: userId })
      .first();
  },

  async update(id, batchData, trx = null) {
    const query = trx || db;

    await query("payment_batches")
      .where({ id })
      .update({
        ...batchData,
        updated_at: db.fn.now(),
      });

    return this.findById(id, trx);
  },

  async getDetailedByIdForUser(id, userId) {
    const batch = await this.findByIdForUser(id, userId);

    if (!batch) {
      return null;
    }

    const transactions = await Transaction.getByBatchId(id);

    return {
      ...batch,
      transactions,
    };
  },
};

export default BatchPayment;
