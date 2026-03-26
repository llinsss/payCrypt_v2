'use strict';

require('dotenv').config();

const express = require('express');
const knex = require('knex');
const knexConfig = require('./knexfile');
const { startPoolMonitoring } = require('./utils/dbPoolMonitor');
const { dbHealth } = require('./controllers/healthController');

const app = express();
app.use(express.json());

// Initialise Knex with the environment-appropriate config
const env = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[env]);

app.set('knex', db);

// Routes
app.get('/health/db', dbHealth);

// Start pool monitoring (logs every 60 s)
const monitorTimer = startPoolMonitoring(db);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Graceful shutdown
async function shutdown() {
  clearInterval(monitorTimer);
  await db.destroy();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, db };
