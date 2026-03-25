import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import db, { ensureConnectionWithRetry } from "./config/database.js";
import redis from "./config/redis.js";
import "./listeners.js";
import "./workers.js";
import AuditLog from "./models/AuditLog.js";
import ExportService from "./services/ExportService.js";

import http from "http";
import SocketService from "./services/SocketService.js";

import { initApollo } from './graphql/apollo.js';

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

  const httpServer = http.createServer(app);

  SocketService.init(httpServer);

  await initApollo(app, null, httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (with WebSockets)`);
    console.log(`Bull Board: http://localhost:${PORT}/admin/running-queues`);

    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 90;

    setInterval(async () => {
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
    }, TWENTY_FOUR_HOURS);

    console.log(`Audit log retention: ${retentionDays} days (cleanup every 24h)`);

    setInterval(async () => {
      try {
        const deleted = await ExportService.cleanupExpiredExports();
        if (deleted > 0) {
          console.log(`Export cleanup: deleted ${deleted} expired export files`);
        }
      } catch (err) {
        console.error("Export cleanup failed:", err.message);
      }
    }, TWENTY_FOUR_HOURS);
  });
})();