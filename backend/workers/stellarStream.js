import dotenv from 'dotenv';
dotenv.config();

import { createStreamService } from '../services/StellarStreamService.js';
import logger from '../utils/logger.js';

const WORKER_NAME = 'stellar-stream-worker';

async function main() {
  logger.info(`[${WORKER_NAME}] Starting Stellar Horizon stream worker...`);

  try {
    const streamService = createStreamService();
    
    await streamService.start();
    
    logger.info(`[${WORKER_NAME}] Stellar stream started successfully`);
    logger.info(`[${WORKER_NAME}] Horizon URL: ${streamService.getHorizonUrl()}`);

    const shutdown = async (signal) => {
      logger.info(`[${WORKER_NAME}] Received ${signal}, shutting down gracefully...`);
      
      try {
        streamService.stop();
        logger.info(`[${WORKER_NAME}] Stream stopped successfully`);
        process.exit(0);
      } catch (error) {
        logger.error(`[${WORKER_NAME}] Error during shutdown:`, error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      logger.error(`[${WORKER_NAME}] Uncaught exception:`, error);
      streamService.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`[${WORKER_NAME}] Unhandled rejection at:`, promise, 'reason:', reason);
    });

  } catch (error) {
    logger.error(`[${WORKER_NAME}] Failed to start:`, error);
    process.exit(1);
  }
}

main();