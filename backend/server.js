import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import knex from "knex";
import knexConfig from "./knexfile.js";
import redis from "./config/redis.js";
import "./listeners.js";
import "./workers.js";

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    const db = knex(knexConfig);
    const migrations = await db.migrate.latest();
    if (migrations && migrations.length) {
      console.log("🛠️ Applied migrations:", migrations.join(", "));
    } else {
      console.log("✅ No new migrations to run");
    }
  } catch (err) {
    console.error("⚠️ Database connection failed:", err.message);
    console.warn("🚀 Starting server without database migrations");
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(
      `📬 Bull Board: http://localhost:${PORT}/admin/running-queues`
    );
  });
})();
