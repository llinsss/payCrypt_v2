'use strict';

const { checkPoolHealth } = require('../utils/dbPoolMonitor');

/**
 * GET /health/db
 * Returns pool health and metrics. 200 = healthy, 503 = unhealthy.
 */
async function dbHealth(req, res) {
  const knex = req.app.get('knex');
  const result = await checkPoolHealth(knex);
  const status = result.healthy ? 200 : 503;
  res.status(status).json(result);
}

module.exports = { dbHealth };
