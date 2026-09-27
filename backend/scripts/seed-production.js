#!/usr/bin/env node
/**
 * Production-safe seeding script
 * Loads only essential, production-safe seed data (tokens and chains)
 * Excludes demo data like users, transactions, and example Stellar data
 *
 * Usage: node scripts/seed-production.js
 */
import knex from "knex";
import config from "../knexfile.js";

const db = knex(config);

async function seedProduction() {
  try {
    console.log("🌱 Seeding production-safe data...");

    // Seed tokens (production-safe)
    console.log("  → Seeding tokens...");
    const tokenSeed = await import("../seeds/01_production_tokens_seed.js");
    await tokenSeed.seed(db);

    // Seed chains (production-safe)
    console.log("  → Seeding chains...");
    const chainSeed = await import("../seeds/02_production_chains_seed.js");
    await chainSeed.seed(db);

    console.log("✅ Production seeding complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

seedProduction();
