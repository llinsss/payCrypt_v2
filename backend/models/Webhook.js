import db from "../config/database.js";

const Webhook = {
  async findById(id) {
    return await db("webhooks").where({ id }).first();
  },

  async findByUserId(user_id) {
    return await db("webhooks").where({ user_id });
  },

  async findActive(user_id = null) {
    const query = db("webhooks").where({ is_active: true, status: 'active' });
    if (user_id) {
      query.where({ user_id });
    }
    return await query;
  },

  async create(webhookData) {
    const [id] = await db("webhooks").insert({
      ...webhookData,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning('id');
    return this.findById(id);
  },

  async update(id, webhookData) {
    await db("webhooks")
      .where({ id })
      .update({
        ...webhookData,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async updateStatus(id, status, error = null) {
    const updateData = {
      status,
      updated_at: db.fn.now(),
    };
    
    if (status === 'failed') {
      updateData.last_failure_at = db.fn.now();
      updateData.last_error = error;
    } else if (status === 'active') {
      updateData.last_success_at = db.fn.now();
      updateData.retry_count = 0;
    }

    await db("webhooks").where({ id }).update(updateData);
    return this.findById(id);
  },

  async incrementRetry(id) {
    await db("webhooks")
      .where({ id })
      .increment('retry_count', 1)
      .update({ updated_at: db.fn.now() });
    return this.findById(id);
  },

  async recordTrigger(id, success = true) {
    const updateData = {
      last_triggered_at: db.fn.now(),
      updated_at: db.fn.now(),
    };

    if (success) {
      updateData.last_success_at = db.fn.now();
      updateData.retry_count = 0;
    } else {
      updateData.last_failure_at = db.fn.now();
    }

    await db("webhooks").where({ id }).update(updateData);
  },

  async delete(id) {
    return await db("webhooks").where({ id }).del();
  },

  async deactivate(id) {
    await db("webhooks")
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now(),
      });
  },

  async activate(id) {
    await db("webhooks")
      .where({ id })
      .update({
        is_active: true,
        status: 'active',
        retry_count: 0,
        updated_at: db.fn.now(),
      });
  },

  async getByEvent(eventType) {
    return await db("webhooks")
      .where({ is_active: true, status: 'active' })
      .whereRaw("events @> ?", [JSON.stringify([eventType])]);
  },
};

export default Webhook;
