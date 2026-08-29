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

const [{ default: app }, { default: db, ensureConnectionWithRetry }, { default: redis }, , , { default: HousekeepingService }, { default: SocketService }, { initApollo }] = await Promise.all([
  import("./app.js"),
  import("./config/database.js"),
  import("./config/redis.js"),
  import("./listeners.js"),
  import("./workers.js"),
  import("./services/HousekeepingService.js"),
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

  const shutdown = (signal) => {
    console.log(`${signal} received; stopping Stellar payment streams`);
    stellarStreamService.stop();
    httpServer.close(() => process.exit(0));
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (with WebSockets)`);
    console.log(`Bull Board: http://localhost:${PORT}/admin/running-queues`);

    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 90;

    // Housekeeping jobs run on every replica's timer, but HousekeepingService
    // wraps each run in a distributed lease (see backend/services/
    // HousekeepingService.js) so only one replica actually executes the work
    // per tick; the rest observe the lease held and skip. See
    // backend/docs/housekeeping-jobs.md for details.
    setInterval(async () => {
      try {
        await HousekeepingService.runAuditLogCleanup(retentionDays);
      } catch (err) {
        console.error("Audit log cleanup failed:", err.message);
      }
    }, TWENTY_FOUR_HOURS);

    console.log(`Audit log retention: ${retentionDays} days (cleanup every 24h)`);

    setInterval(async () => {
      try {
        await HousekeepingService.runExportCleanup();
      } catch (err) {
        console.error("Export cleanup failed:", err.message);
      }
    }, TWENTY_FOUR_HOURS);
  });
})();
