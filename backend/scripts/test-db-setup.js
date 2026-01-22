#!/usr/bin/env node

/**
 * Test script to verify database setup and migrations
 * Run with: node scripts/test-db-setup.js
 */

import {
  checkDatabaseConnection,
  getConnectionPoolStats,
  checkMigrationStatus,
  testDatabasePerformance,
} from "../utils/dbHealth.js";

import {
  StellarTag,
  StellarAccount,
  StellarTransaction,
  Webhook,
  WebhookEvent,
} from "../models/index.js";

console.log("🔍 Testing Stellar SDK Database Setup\n");

async function runTests() {
  try {
    // Test 1: Database Connection
    console.log("1️⃣  Testing database connection...");
    const connectionHealth = await checkDatabaseConnection();
    console.log(
      connectionHealth.healthy ? "   ✅ Connected" : "   ❌ Failed",
      connectionHealth.message
    );

    if (!connectionHealth.healthy) {
      console.error("\n❌ Database connection failed. Please check your configuration.");
      process.exit(1);
    }

    // Test 2: Connection Pool
    console.log("\n2️⃣  Checking connection pool...");
    const poolStats = getConnectionPoolStats();
    console.log("   ✅ Pool stats:", poolStats);

    // Test 3: Migration Status
    console.log("\n3️⃣  Checking migration status...");
    const migrationStatus = await checkMigrationStatus();
    if (migrationStatus.error) {
      console.log("   ⚠️  Migration check failed:", migrationStatus.error);
    } else {
      console.log("   ✅ Current version:", migrationStatus.currentVersion);
      console.log("   ✅ Completed migrations:", migrationStatus.completed.length);
      console.log("   ⚠️  Pending migrations:", migrationStatus.pending.length);
    }

    // Test 4: Performance
    console.log("\n4️⃣  Testing database performance...");
    const perfTest = await testDatabasePerformance();
    if (perfTest.healthy) {
      console.log("   ✅ Simple query:", perfTest.simpleQueryMs, "ms");
      console.log("   ✅ Table query:", perfTest.tableQueryMs, "ms");
    } else {
      console.log("   ❌ Performance test failed:", perfTest.error);
    }

    // Test 5: Model Operations
    console.log("\n5️⃣  Testing model operations...");

    // Test StellarTag model
    console.log("   Testing StellarTag model...");
    const tags = await StellarTag.getAll(1, 0);
    console.log("   ✅ StellarTag.getAll() works -", tags.length, "tags found");

    // Test StellarAccount model
    console.log("   Testing StellarAccount model...");
    const accounts = await StellarAccount.getAll(1, 0);
    console.log("   ✅ StellarAccount.getAll() works -", accounts.length, "accounts found");

    // Test StellarTransaction model
    console.log("   Testing StellarTransaction model...");
    const transactions = await StellarTransaction.findByStatus("pending", 1, 0);
    console.log("   ✅ StellarTransaction.findByStatus() works -", transactions.length, "transactions found");

    // Test Webhook model
    console.log("   Testing Webhook model...");
    const webhooks = await Webhook.findActive();
    console.log("   ✅ Webhook.findActive() works -", webhooks.length, "webhooks found");

    // Test WebhookEvent model
    console.log("   Testing WebhookEvent model...");
    const events = await WebhookEvent.findPending(1);
    console.log("   ✅ WebhookEvent.findPending() works -", events.length, "events found");

    console.log("\n✅ All tests passed! Database setup is complete.\n");
    console.log("📚 Next steps:");
    console.log("   1. Review the schema: docs/stellar-database-schema.md");
    console.log("   2. Check the API reference: docs/stellar-models-api.md");
    console.log("   3. Start integrating with your Stellar SDK code\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("   1. Ensure PostgreSQL is running");
    console.error("   2. Check your .env configuration");
    console.error("   3. Run migrations: npm run migrate");
    console.error("   4. Review DATABASE_SETUP.md for detailed instructions\n");
    process.exit(1);
  }
}

runTests();
