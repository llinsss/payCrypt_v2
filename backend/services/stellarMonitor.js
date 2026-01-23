import { Horizon } from 'stellar-sdk';
import logger from '../utils/logger.js';

const STELLAR_HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(STELLAR_HORIZON_URL);

export const checkStellarHealth = async () => {
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

export const monitorStellarNetwork = () => {
    // Run initial check
    checkStellarHealth();

    // Schedule periodic checks (e.g., every 5 minutes)
    setInterval(async () => {
        await checkStellarHealth();
    }, 5 * 60 * 1000);
};
