import StellarStreamService from "../services/StellarStreamService.js";
import logger from "../utils/logger.js";

/**
 * Persistent Stellar Horizon streaming worker.
 *
 * Disabled by default so environments without Horizon access (CI, local
 * dev) are unaffected. Enable with STELLAR_STREAM_ENABLED=true.
 */
if (process.env.STELLAR_STREAM_ENABLED === "true") {
  StellarStreamService.start().catch((error) => {
    logger.error("Stellar stream: startup failed", { error: error.message });
  });

  const shutdown = () => StellarStreamService.stop();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} else {
  logger.info("Stellar stream: disabled (set STELLAR_STREAM_ENABLED=true)");
}

export default StellarStreamService;
