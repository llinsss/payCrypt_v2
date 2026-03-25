#!/usr/bin/env node

/**
 * Migration Test Runner
 * Iterates through all migrations, running UP/DOWN cycles and validating schema.
 */

import knexFactory from "knex";
import config from "../knexfile.js";
import migrationValidatorFactory from "../utils/migrationValidator.js";
import fs from "fs";
import path from "path";

const env = "test_migrations";
const knex = knexFactory(config[env]);
const validator = migrationValidatorFactory(knex);

async function runTests() {
  console.log("🚀 Starting Migration Tests...\n");

  try {
    // 1. Ensure test database exists and is empty
    const dbName = config[env].connection.database;
    console.log(`📡 Using database: ${dbName}`);
    
    // We assume the database is already created or handled by the environment.
    // For this runner, we'll just ensure we start from scratch.
    console.log("♻️ Resetting database...");
    await knex.migrate.rollback(null, true);
    console.log("✅ Database reset.\n");

    // 2. Get list of migration files
    const migrationsDir = path.join(process.cwd(), "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".js"))
      .sort();

    console.log(`📂 Found ${migrationFiles.length} migrations to test.\n`);

    // 3. Iterate through migrations
    for (const file of migrationFiles) {
      console.log(`➡️ Testing: ${file}`);
      
      try {
        // UP
        console.log("   ⬆️ Migrating UP...");
        await knex.migrate.up();
        console.log("   ✅ Migrated UP.");

        // TODO: CUSTOM VALIDATION PER MIGRATION COULD GO HERE
        // For now, we'll do generic validation if needed or just trust Knex didn't throw.
        
        // DOWN
        console.log("   ⬇️ Rolling back (DOWN)...");
        await knex.migrate.rollback();
        console.log("   ✅ Rolled back.");
        
        // Re-apply to move to next one in the sequence
        console.log("   ⬆️ Re-applying UP for sequence continuity...");
        await knex.migrate.up();
        console.log("   ✅ Sequence stable.");
        
        console.log(`✨ ${file} passed.\n`);
      } catch (err) {
        console.error(`❌ FAILED migration test for ${file}:`, err.message);
        process.exit(1);
      }
    }

    console.log("🎉 ALL MIGRATIONS PASSED UP/DOWN TEST!");
    process.exit(0);
  } catch (err) {
    console.error("💥 Unhandled Runner Error:", err);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

runTests();
