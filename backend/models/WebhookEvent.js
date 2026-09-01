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
    const [{ id }] = await db("webhook_events").insert({
      ...eventData,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }).returning('id');
    return this.findById(id);
  },

  // Returns existing row if idempotency_key already exists, otherwise inserts.
  async createIdempotent(eventData) {
    const { webhook_id, idempotency_key } = eventData;
    const existing = await db("webhook_events").where({ webhook_id, idempotency_key }).first();
    if (existing) return existing;
    return this.create(eventData);
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

  async findDeadLetters(limit = 50, offset = 0) {
    return await db("webhook_events")
      .where({ status: 'dead_letter' })
      .limit(limit)
      .offset(offset)
      .orderBy("updated_at", "desc");
  },

  /**
   * Atomically claim a dead-letter event for a manual retry.
   *
   * The status transition `dead_letter -> retrying` happens in a single
   * conditional UPDATE, so concurrent admin retries race on the database: the
   * first wins (1 row updated), every other caller sees 0 rows and must treat
   * the retry as already in flight.
   *
   * @returns {Promise<number>} number of rows updated (1 = claimed, 0 = duplicate)
   */
  async claimForManualRetry(id) {
    return await db("webhook_events")
      .where({ id, status: "dead_letter" })
      .update({
        status: "retrying",
        updated_at: db.fn.now(),
      });
  },

  /**
   * Return a claimed-but-undelivered event to the dead-letter queue, e.g. when
   * the manual dispatch throws before the delivery service records an outcome.
   */
  async releaseManualRetry(id) {
    return await db("webhook_events")
      .where({ id, status: "retrying" })
      .update({
        status: "dead_letter",
        updated_at: db.fn.now(),
      });
  },

  async markDeadLetter(id, error_message) {
    await db("webhook_events")
      .where({ id })
      .update({
        status: 'dead_letter',
        error_message,
        updated_at: db.fn.now(),
      });
    return this.findById(id);
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
