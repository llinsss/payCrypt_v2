import { Horizon } from 'stellar-sdk';
import logger from '../utils/logger.js';

const STELLAR_HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(STELLAR_HORIZON_URL);
const MONITOR_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Legacy Horizon health monitor. It only probes Horizon's root endpoint;
 * incoming payments are ingested by StellarStreamService, which persists a
 * per-account cursor in Redis and deduplicates replayed events.
 *
 * Checks are single-flight: while one Horizon request is pending, every
 * caller (the monitor loop and /health) shares it instead of starting another.
 */
let inFlightCheck = null;

export const checkStellarHealth = () => {
    inFlightCheck ??= runHealthCheck().finally(() => {
        inFlightCheck = null;
    });
    return inFlightCheck;
};

const runHealthCheck = async () => {
    const start = process.hrtime();
    try {
        const response = await server.root();
        const diff = process.hrtime(start);
        const latency = (diff[0] * 1e9 + diff[1]) / 1e6;

        logger.info(`Stellar Network Health Check: OK (${latency.toFixed(3)}ms)`, {
            service: 'stellar',
            status: 'up',
            latency,
            horizon_version: response.horizon_version,
            core_version: response.core_version,
        });

        return {
            status: 'up',
            latency: latency.toFixed(3),
            details: {
                horizon_version: response.horizon_version,
                core_version: response.core_version,
            }
        };
    } catch (error) {
        const diff = process.hrtime(start);
        const latency = (diff[0] * 1e9 + diff[1]) / 1e6;

        logger.error(`Stellar Network Health Check: DOWN (${latency.toFixed(3)}ms)`, {
            service: 'stellar',
            status: 'down',
            latency,
            error: error.message,
        });

        return {
            status: 'down',
            latency: latency.toFixed(3),
            error: error.message,
        };
    }
};

/**
 * Polls Horizon health serially: the next check is scheduled only after the
 * previous one settles, so slow responses can never stack overlapping polls.
 * Returns a function that stops the monitor.
 */
export const monitorStellarNetwork = ({ intervalMs = MONITOR_INTERVAL_MS } = {}) => {
    let timer = null;
    let stopped = false;

    const poll = async () => {
        await checkStellarHealth();
        if (!stopped) timer = setTimeout(poll, intervalMs);
    };

    poll();

    return () => {
        stopped = true;
        clearTimeout(timer);
    };
};
