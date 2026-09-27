#!/usr/bin/env node

/**
 * Updates `knex_migrations` for migrations that were renamed after being
 * applied (see RENAMED_MIGRATIONS). Runs before every Knex CLI migration
 * command; it is a no-op on fresh or already-synced databases.
 */

import knex from "knex";
import config from "../knexfile.js";
import { syncRenamedMigrations } from "../utils/migrationIds.js";

const db = knex(config);

try {
  const updated = await syncRenamedMigrations(db);
  if (updated > 0) console.log(`Synced ${updated} renamed migration record(s).`);
} catch (err) {
  console.error("Failed to sync renamed migrations:", err.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
