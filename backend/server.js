import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import knex from "knex";
import knexConfig from "./knexfile.js";
import redis from "./config/redis.js";
import "./listeners.js";
import "./workers.js";
import AuditLog from "./models/AuditLog.js";

import http from "http";
import SocketService from "./services/SocketService.js";

import { initApollo } from './graphql/apollo.js';

const PORT = process.env.PORT || 3000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

(async () => {
  try {
    const db = knex(knexConfig);
    const migrations = await db.migrate.latest();
    if (migrations && migrations.length) {
      console.log("Applied migrations:", migrations.join(", "));
    } else {
      console.log("No new migrations to run");
    }
  } catch (err) {
    console.error("Database connection failed:", err.message);
    console.warn("Starting server without database migrations");
  }

  const httpServer = http.createServer(app);

  // Initialize Socket.io
  SocketService.init(httpServer);

  // Initialize Apollo GraphQL Server
  await initApollo(app, null, httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (with WebSockets)`);
    console.log(
      `Bull Board: http://localhost:${PORT}/admin/running-queues`
    );

    // Audit log retention policy — runs every 24 hours
    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 90;
    setInterval(async () => {
      try {
        const deleted = await AuditLog.deleteOlderThan(retentionDays);
        if (deleted > 0) {
          console.log(`Audit log cleanup: deleted ${deleted} entries older than ${retentionDays} days`);
        }
      } catch (err) {
        console.error("Audit log cleanup failed:", err.message);
      }
    }, TWENTY_FOUR_HOURS);
    console.log(`Audit log retention: ${retentionDays} days (cleanup every 24h)`);
  });
})();

