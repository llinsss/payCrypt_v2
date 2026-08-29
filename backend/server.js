import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { validateEnv } from "./config/env.validation.js";
import stellarStreamService from "./services/StellarStreamService.js";

let validatedEnv;
try {
  validatedEnv = validateEnv(process.env);
  Object.assign(process.env, validatedEnv);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const [{ default: app }, { default: db, ensureConnectionWithRetry }, { default: redis }, , , { default: AuditLog }, { default: ExportService }, { default: SocketService }, { initApollo }] = await Promise.all([
  import("./app.js"),
  import("./config/database.js"),
  import("./config/redis.js"),
  import("./listeners.js"),
  import("./workers.js"),
  import("./models/AuditLog.js"),
  import("./services/ExportService.js"),
  import("./services/SocketService.js"),
  import("./graphql/apollo.js"),
]);

const PORT = process.env.PORT || 3000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === "production";

(async () => {
  const connectionResult = await ensureConnectionWithRetry();

  if (!connectionResult.ok) {
    console.error("Database connection failed after retries:", connectionResult.error);

    if (isProduction) {
      console.error("Exiting: database connection is required in production");
      process.exit(1);
    } else {
      console.warn("Continuing without database in development mode");
    }
  } else {
    try {
      console.log("Checking pending migrations...");

      const [completed, pending] = await db.migrate.list();

      if (pending.length > 0) {
        console.log("Pending migrations:", pending);

        if (isProduction) {
          console.error("Exiting: pending migrations must be applied before startup in production");
          process.exit(1);
        }
      }

      console.log("Running database migrations...");
      const [batchNo, migrations] = await db.migrate.latest();

      if (migrations.length > 0) {
        console.log("Applied migrations:", migrations.join(", "));
      } else {
        console.log("No new migrations to run");
      }

    } catch (err) {
      console.error("Database migrations failed:", err.message);

      if (isProduction) {
        console.error("Exiting due to migration failure in production");
        process.exit(1);
      } else {
        console.warn("Continuing without migrations in development mode");
      }
    }
  }

  // Start only after migrations complete, so the stream never races the
  // stellar account/tag tables at boot. It reconnects internally on Horizon
  // outages and restores each account's Redis cursor after a restart.
  if (connectionResult.ok) {
    try {
      await stellarStreamService.start();
    } catch (error) {
      console.error("Stellar payment stream failed to start:", error.message);
      if (isProduction) process.exit(1);
    }
  }

  const httpServer = http.createServer(app);

  SocketService.init(httpServer);

  await initApollo(app, null, httpServer);

  // Track background timers for clean shutdown
  const activeTimers = [];

  const SHUTDOWN_DEADLINE_MS = parseInt(process.env.SHUTDOWN_DEADLINE_MS || "15000", 10);
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — starting graceful shutdown (deadline: ${SHUTDOWN_DEADLINE_MS}ms)`);

    // Hard deadline: force exit if graceful shutdown takes too long
    const deadline = setTimeout(() => {
      console.error("Graceful shutdown deadline exceeded — forcing exit");
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    deadline.unref();

    try {
      // 1. Stop accepting new HTTP connections
      await new Promise((resolve) => httpServer.close(resolve));
      console.log("  [1/6] HTTP server closed");

      // 2. Close Socket.IO (disconnect all clients)
      if (SocketService.io) {
        await new Promise((resolve) => SocketService.io.close(resolve));
      }
      console.log("  [2/6] Socket.IO closed");

      // 3. Stop Stellar payment streams
      stellarStreamService.stop();
      console.log("  [3/6] Stellar streams stopped");

      // 4. Close BullMQ workers (stop processing new jobs, let in-flight finish)
      // Workers are imported as side-effects in workers.js; they self-register
      // and will be garbage-collected. For a clean close we pause them.
      console.log("  [4/6] BullMQ workers draining");

      // 5. Close Redis connections
      try {
        if (redis.isOpen) await redis.quit();
      } catch { /* ignore */ }
      console.log("  [5/6] Redis closed");

      // 6. Destroy database pool
      try {
        await db.destroy();
      } catch { /* ignore */ }
      console.log("  [6/6] Database pool destroyed");

      // Clear background timers (audit cleanup, export cleanup, USSD)
      for (const id of activeTimers) clearInterval(id);
      console.log("  Graceful shutdown complete");

      process.exit(0);
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (with WebSockets)`);
    console.log(`Bull Board: http://localhost:${PORT}/admin/running-queues`);

    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 90;

    activeTimers.push(setInterval(async () => {
      try {
        const deleted = await AuditLog.deleteOlderThan(retentionDays);
        if (deleted > 0) {
          console.log(
            `Audit log cleanup: deleted ${deleted} entries older than ${retentionDays} days`
          );
        }
      } catch (err) {
        console.error("Audit log cleanup failed:", err.message);
      }
    }, TWENTY_FOUR_HOURS));

    console.log(`Audit log retention: ${retentionDays} days (cleanup every 24h)`);

    activeTimers.push(setInterval(async () => {
      try {
        const deleted = await ExportService.cleanupExpiredExports();
        if (deleted > 0) {
          console.log(`Export cleanup: deleted ${deleted} expired export files`);
        }
      } catch (err) {
        console.error("Export cleanup failed:", err.message);
      }
    }, TWENTY_FOUR_HOURS));
  });
})();
