'use strict';

require('dotenv').config();

const { poolConfig, connectionConfig } = require('./config/database');

module.exports = {
  development: {
    client: 'pg',
    connection: connectionConfig,
    pool: poolConfig,
    migrations: { directory: './migrations' },
  },

  test: {
    client: 'pg',
    connection: { ...connectionConfig, database: process.env.DB_TEST_NAME || 'app_db_test' },
    pool: { ...poolConfig, min: 1, max: 5 },
    migrations: { directory: './migrations' },
  },

  production: {
    client: 'pg',
    connection: connectionConfig,
    pool: poolConfig,
    migrations: { directory: './migrations' },
  },
};
