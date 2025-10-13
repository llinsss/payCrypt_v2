import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import knex from "knex";
import knexConfig from "./knexfile.js";
import redis from "./config/redis.js";
import { balanceWorker } from "./workers.js";

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    // ------------------------
    // 1️⃣ Run Knex migrations
    // ------------------------
    const db = knex(knexConfig);
    const migrations = await db.migrate.latest();
    if (migrations && migrations.length) {
      console.log("🛠️ Applied migrations:", migrations.join(", "));
    } else {
      console.log("✅ No new migrations to run");
    }

    // ------------------------
    // 2️⃣ Connect Redis
    // ------------------------

    // ------------------------
    // 3️⃣ Start Bull workers
    // ------------------------
    balanceWorker.on("completed", (job) => {
      console.log(`✅ Balance job completed: ${job.id}`);
    });
    balanceWorker.on("failed", (job, err) => {
      console.error(`❌ Balance job failed: ${job.id}`, err);
    });
    console.log("📬 Balance worker initialized");

    // ------------------------
    // 4️⃣ Start Express server
    // ------------------------
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(
        `📬 Bull Board: http://localhost:${PORT}/admin/running-queues`
      );
    });
  } catch (err) {
    console.error("❌ Server startup failed:", err);
    process.exit(1);
  }
})();
