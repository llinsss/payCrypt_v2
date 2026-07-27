import "./workers/balance.js";
import "./workers/scheduler.js";
import "./workers/transactionConfirmation.js";
import "./workers/batchPayment.js";
import "./queues/exportQueue.js";
import UssdService from "./services/UssdService.js";

const shouldStartStellarStream = process.env.ENABLE_STELLAR_STREAM !== 'false';

if (shouldStartStellarStream) {
  try {
    const { createStreamService } = await import('./services/StellarStreamService.js');
    const streamService = createStreamService();
    
    streamService.start().catch(err => {
      console.error('[Server] Failed to start Stellar stream:', err.message);
    });
    
    console.log('[Server] Stellar stream initialization initiated');
    
    const shutdownStream = () => {
      console.log('[Server] Stopping Stellar stream...');
      streamService.stop();
    };
    
    process.on('SIGTERM', shutdownStream);
    process.on('SIGINT', shutdownStream);
    
  } catch (error) {
    console.error('[Server] Could not initialize Stellar stream:', error.message);
  }
}

setInterval(() => {
  UssdService.cleanupExpiredSessions();
}, 5 * 60 * 1000);