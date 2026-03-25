import db from "../config/database.js";

const Withdrawal = {
  async create(withdrawalData, trx = null) {
    const query = trx || db;
    const [id] = await query("withdrawals").insert({
      ...withdrawalData,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning("id");
    
    return this.findById(id, trx);
  },

  async findById(id, trx = null) {
    const query = trx || db;
    return await query("withdrawals")
      .select("withdrawals.*", "users.email", "users.tag", "tokens.symbol as token_symbol", "bank_accounts.account_number", "bank_accounts.bank_code")
      .leftJoin("users", "withdrawals.user_id", "users.id")
      .leftJoin("tokens", "withdrawals.token_id", "tokens.id")
      .leftJoin("bank_accounts", "withdrawals.bank_account_id", "bank_accounts.id")
      .where("withdrawals.id", id)
      .first();
  },

  async findByReference(reference, trx = null) {
    const query = trx || db;
    return await query("withdrawals").where({ provider_reference: reference }).first();
  },

  async update(id, updateData, trx = null) {
    const query = trx || db;
    await query("withdrawals")
      .where({ id })
      .update({
        ...updateData,
        updated_at: db.fn.now(),
      });
    return this.findById(id, trx);
  },

  async getByUserId(userId, limit = 10, offset = 0) {
    return await db("withdrawals")
      .where({ user_id: userId })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async updateStatus(id, status, statusMessage = null, trx = null) {
    const query = trx || db;
    const updateData = { status, updated_at: db.fn.now() };
    if (statusMessage) {
      updateData.status_message = statusMessage;
    }
    await query("withdrawals").where({ id }).update(updateData);
    return this.findById(id, trx);
  }
};

export default Withdrawal;
