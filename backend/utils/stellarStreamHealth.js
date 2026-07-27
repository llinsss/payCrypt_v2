import { getStreamService } from '../services/StellarStreamService.js';
import redis from '../config/redis.js';

export const checkStellarStreamHealth = async () => {
  const start = Date.now();
  
  try {
    const streamService = getStreamService();
    const status = await streamService.getStatus();
    
    const isHealthy = 
      status.running && 
      status.connected &&
      status.errorCount < 10;
    
    const timeSinceLastHeartbeat = status.lastHeartbeat
      ? Date.now() - new Date(status.lastHeartbeat).getTime()
      : null;

    const heartbeatStale = timeSinceLastHeartbeat && timeSinceLastHeartbeat > 120000;

    return {
      healthy: isHealthy && !heartbeatStale,
      running: status.running,
      connected: status.connected,
      latencyMs: Date.now() - start,
      details: {
        startedAt: status.startedAt,
        lastHeartbeat: status.lastHeartbeat,
        lastProcessedCursor: status.lastProcessedCursor,
        errorCount: status.errorCount,
        lastError: status.lastError,
        reconnectAttempts: status.reconnectAttempts || 0,
      },
      message: !status.running
        ? 'Stream is not running'
        : !status.connected
          ? 'Stream is disconnected'
          : heartbeatStale
            ? 'Stream heartbeat is stale'
            : isHealthy
              ? 'Stellar stream is healthy'
              : 'Stellar stream has issues',
    };
  } catch (error) {
    return {
      healthy: false,
      running: false,
      connected: false,
      latencyMs: Date.now() - start,
      message: `Stream health check failed: ${error.message}`,
      error: error.message,
    };
  }
};

export const getStreamMetrics = async () => {
  try {
    const streamService = getStreamService();
    const status = await streamService.getStatus();
    
    let subscribedCount = 0;
    try {
      const addressesData = await redis.get('stellar:stream:addresses');
      if (addressesData) {
        const addresses = JSON.parse(addressesData);
        subscribedCount = Object.keys(addresses).length;
      }
    } catch {
      // Redis not available
    }

    return {
      status: status,
      metrics: {
        subscribedAddresses: subscribedCount,
        uptimeSeconds: status.startedAt 
          ? Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1000)
          : 0,
        errorRate: status.startedAt
          ? (status.errorCount / Math.max(1, Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 60000))) * 60
          : 0,
      },
      horizon: {
        url: streamService.getHorizonUrl(),
      },
    };
  } catch (error) {
    return {
      error: error.message,
    };
  }
};

export const controlStream = async (action) => {
  const streamService = getStreamService();
  
  switch (action) {
    case 'start':
      if (!streamService.running) {
        await streamService.start();
        return { success: true, message: 'Stream started' };
      }
      return { success: true, message: 'Stream already running' };
    
    case 'stop':
      if (streamService.running) {
        streamService.stop();
        return { success: true, message: 'Stream stopped' };
      }
      return { success: true, message: 'Stream already stopped' };
    
    case 'restart':
      streamService.stop();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await streamService.start();
      return { success: true, message: 'Stream restarted' };
    
    case 'reload':
      await streamService.reloadAddresses();
      return { success: true, message: 'Addresses reloaded' };
    
    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
};

export default {
  checkStellarStreamHealth,
  getStreamMetrics,
  controlStream,
};