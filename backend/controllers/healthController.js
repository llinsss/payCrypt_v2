import knex from 'knex';
import config from '../knexfile.js';
import redis from '../config/redis.js';
import { checkStellarHealth } from '../services/stellarMonitor.js';

const db = knex(config);

export const getHealth = async (req, res) => {
    const health = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        status: 'ok',
        checks: {
            database: { status: 'unknown' },
            redis: { status: 'unknown' },
            stellar: { status: 'unknown' },
        },
    };

    try {
        // Check Database
        await db.raw('SELECT 1');
        health.checks.database.status = 'up';
    } catch (error) {
        health.checks.database.status = 'down';
        health.checks.database.error = error.message;
        health.status = 'degraded';
    }

    try {
        // Check Redis
        await redis.ping();
        health.checks.redis.status = 'up';
    } catch (error) {
        health.checks.redis.status = 'down';
        health.checks.redis.error = error.message;
        health.status = 'degraded';
    }

    try {
        // Check Stellar
        const stellarHealth = await checkStellarHealth();
        health.checks.stellar = stellarHealth;
        if (stellarHealth.status !== 'up') {
            health.status = 'degraded';
        }
    } catch (error) {
        health.checks.stellar.status = 'down';
        health.checks.stellar.error = error.message;
        health.status = 'degraded';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
};
