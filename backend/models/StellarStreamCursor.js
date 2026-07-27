import db from "../config/database.js";

const StellarStreamCursor = {
  async findByAddress(stellarAddress) {
    return await db("stellar_stream_cursors")
      .where({ stellar_address: stellarAddress })
      .first();
  },

  async getOrCreate(stellarAddress) {
    let cursor = await this.findByAddress(stellarAddress);
    
    if (!cursor) {
      const [id] = await db("stellar_stream_cursors")
        .insert({
          stellar_address: stellarAddress,
          cursor: "now",
          processed_count: 0,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .returning("id");
      
      cursor = await this.findById(id);
    }
    
    return cursor;
  },

  async findById(id) {
    return await db("stellar_stream_cursors")
      .where({ id })
      .first();
  },

  async getAll(limit = 100, offset = 0) {
    return await db("stellar_stream_cursors")
      .select("*")
      .limit(limit)
      .offset(offset)
      .orderBy("last_processed_at", "desc");
  },

  async getEarliest() {
    return await db("stellar_stream_cursors")
      .orderBy("last_processed_at", "asc")
      .first();
  },

  async getLatest() {
    return await db("stellar_stream_cursors")
      .orderBy("last_processed_at", "desc")
      .first();
  },

  async update(stellarAddress, data) {
    await db("stellar_stream_cursors")
      .where({ stellar_address: stellarAddress })
      .update({
        ...data,
        updated_at: db.fn.now(),
      });
    
    return await this.findByAddress(stellarAddress);
  },

  async markProcessed(stellarAddress, cursor, txHash) {
    const existing = await this.findByAddress(stellarAddress);
    
    if (existing) {
      return await this.update(stellarAddress, {
        cursor,
        last_tx_hash: txHash,
        last_processed_at: db.fn.now(),
        processed_count: existing.processed_count + 1,
      });
    } else {
      const [id] = await db("stellar_stream_cursors")
        .insert({
          stellar_address: stellarAddress,
          cursor,
          last_tx_hash: txHash,
          last_processed_at: db.fn.now(),
          processed_count: 1,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .returning("id");
      
      return await this.findById(id);
    }
  },

  async reset(stellarAddress) {
    return await this.update(stellarAddress, {
      cursor: "now",
      last_tx_hash: null,
      last_processed_at: null,
      processed_count: 0,
    });
  },

  async delete(stellarAddress) {
    return await db("stellar_stream_cursors")
      .where({ stellar_address: stellarAddress })
      .del();
  },

  async isProcessed(stellarAddress, txHash) {
    const cursor = await this.findByAddress(stellarAddress);
    return cursor?.last_tx_hash === txHash;
  },

  async getStats() {
    const [stats] = await db("stellar_stream_cursors")
      .select(
        db.raw("COUNT(*) as total_addresses"),
        db.raw("SUM(processed_count) as total_processed"),
        db.raw("AVG(processed_count) as avg_processed"),
        db.raw("MAX(last_processed_at) as last_activity")
      );
    
    return stats;
  },
};

export default StellarStreamCursor;