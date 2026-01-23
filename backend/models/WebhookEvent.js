import db from "../config/database.js";

const WebhookEvent = {
  async findById(id) {
    return await db("webhook_events").where({ id }).first();
  },

  async findByWebhookId(webhook_id, limit = 50, offset = 0) {
    return await db("webhook_events")
      .where({ webhook_id })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
  },

  async findPending(limit = 100) {
    return await db("webhook_events")
      .where({ status: 'pending' })
      .where('next_retry_at', '<=', db.fn.now())
      .limit(limit)
      .orderBy("created_at", "asc");
  },

  async create(eventData) {
    const [id] = await db("webhook_events").insert({
      ...eventData,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning('id');
    return this.findById(id);
  },

  async update(id, eventData) {
    await db("webhook_events")
      .where({ id })
      .update({
        ...eventData,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async markSuccess(id, http_status_code, response_body) {
    await db("webhook_events")
      .where({ id })
      .update({
        status: 'success',
        http_status_code,
        response_body,
        delivered_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async markFailed(id, error_message, http_status_code = null) {
    await db("webhook_events")
      .where({ id })
      .increment('attempt_count', 1)
      .update({
        status: 'failed',
        error_message,
        http_status_code,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async scheduleRetry(id, next_retry_at) {
    await db("webhook_events")
      .where({ id })
      .increment('attempt_count', 1)
      .update({
        status: 'pending',
        next_retry_at,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async delete(id) {
    return await db("webhook_events").where({ id }).del();
  },

  async deleteOld(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return await db("webhook_events")
      .where('created_at', '<', cutoffDate)
      .del();
  },

  async getStats(webhook_id) {
    const stats = await db("webhook_events")
      .where({ webhook_id })
      .select(
        db.raw("COUNT(*) as total"),
        db.raw("COUNT(CASE WHEN status = 'success' THEN 1 END) as success"),
        db.raw("COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed"),
        db.raw("COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending")
      )
      .first();
    
    return stats;
  },
};

export default WebhookEvent;
