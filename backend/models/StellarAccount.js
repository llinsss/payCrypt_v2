import db from "../config/database.js";

const StellarAccount = {
  async findByAddress(stellar_address) {
    return await db("stellar_accounts").where({ stellar_address }).first();
  },

  async findById(id) {
    return await db("stellar_accounts").where({ id }).first();
  },

  async findByUserId(user_id) {
    return await db("stellar_accounts").where({ user_id });
  },

  async create(accountData) {
    const [id] = await db("stellar_accounts").insert({
      ...accountData,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning('id');
    return this.findById(id);
  },

  async update(stellar_address, accountData) {
    await db("stellar_accounts")
      .where({ stellar_address })
      .update({
        ...accountData,
        updated_at: db.fn.now(),
      });
    return this.findByAddress(stellar_address);
  },

  async updateBalance(stellar_address, xlm_balance, balances) {
    await db("stellar_accounts")
      .where({ stellar_address })
      .update({
        xlm_balance,
        balances: JSON.stringify(balances),
        last_synced_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    return this.findByAddress(stellar_address);
  },

  async delete(id) {
    return await db("stellar_accounts").where({ id }).del();
  },

  async getAll(limit = 100, offset = 0) {
    return await db("stellar_accounts")
      .select("*")
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async getActive(limit = 100, offset = 0) {
    return await db("stellar_accounts")
      .where({ is_active: true })
      .limit(limit)
      .offset(offset)
      .orderBy("last_synced_at", "desc");
  },

  async setInactive(stellar_address) {
    await db("stellar_accounts")
      .where({ stellar_address })
      .update({
        is_active: false,
        updated_at: db.fn.now(),
      });
  },
};

export default StellarAccount;
