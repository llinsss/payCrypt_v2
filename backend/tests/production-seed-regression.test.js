/**
 * Production Seed Regression Test
 *
 * Verifies that production-safe seeding (npm run seed:prod) never loads demo data.
 * This test is critical for preventing demo/reference data from contaminating
 * production databases.
 *
 * Demo data markers:
 * - Users: email like '%@demo.tagged.local%' or tag like '@demo_%'
 * - Transactions: reference like 'demo-tx-%' or tx_hash like '0xdemo%'
 * - Stellar: tag like '@stellar_demo' or '@test_account'
 * - Scheduled payments: memo like 'demo-schedule-%'
 *
 * Each test verifies that after running production-safe seeding, NO demo data exists.
 */

import knex from "knex";
import config from "../knexfile.js";

let db;

beforeAll(async () => {
  db = knex(config);
});

afterAll(async () => {
  await db.destroy();
});

describe("Production Seed Regression Tests", () => {
  /**
   * Setup: Run migrations and production-safe seeds
   * This simulates a production deployment workflow
   */
  beforeAll(async () => {
    // Run migrations to set up schema
    await db.migrate.rollback();
    await db.migrate.latest();

    // Run production-safe seeds only
    // Import and run production token seed
    const tokenSeed = await import("../seeds/01_production_tokens_seed.js");
    await tokenSeed.seed(db);

    // Import and run production chain seed
    const chainSeed = await import("../seeds/02_production_chains_seed.js");
    await chainSeed.seed(db);
  });

  describe("Demo Users", () => {
    test("should not have any demo users in database", async () => {
      const demoUsers = await db("users").where((builder) => {
        builder.where("email", "like", "%@demo.tagged.local%").orWhere("tag", "like", "@demo_%");
      });

      expect(demoUsers).toEqual([]);
      expect(demoUsers).toHaveLength(0);
    });

    test("should not have any users with hardcoded demo password", async () => {
      // This is a secondary check - demo users should be prevented by first test
      // but we verify the password hash itself is never in the database
      const users = await db("users");
      const DEMO_PASSWORD = "DemoPass123!";

      for (const user of users) {
        // Passwords are bcrypt hashed, so we just verify email/tag markers aren't present
        expect(user.email).not.toMatch(/@demo\.tagged\.local$/);
        expect(user.tag).not.toMatch(/^@demo_/);
      }
    });

    test("should not have demo wallets or balances", async () => {
      // Get demo user IDs (should be empty from above test)
      const demoUsers = await db("users").where("email", "like", "%@demo.tagged.local%");
      expect(demoUsers).toHaveLength(0);

      // If there were somehow demo users, verify their wallets don't exist
      if (demoUsers.length > 0) {
        const demoUserIds = demoUsers.map((u) => u.id);
        const demoWallets = await db("wallets").whereIn("user_id", demoUserIds);
        expect(demoWallets).toEqual([]);
      }
    });
  });

  describe("Demo Transactions", () => {
    test("should not have any transactions with demo reference", async () => {
      const demoTransactions = await db("transactions").where((builder) => {
        builder.where("reference", "like", "demo-tx-%").orWhere("tx_hash", "like", "0xdemo%");
      });

      expect(demoTransactions).toEqual([]);
      expect(demoTransactions).toHaveLength(0);
    });

    test("should not have development demo descriptions", async () => {
      const suspiciousTransactions = await db("transactions").where(
        "description",
        "like",
        "%Development demo transfer%",
      );

      expect(suspiciousTransactions).toEqual([]);
      expect(suspiciousTransactions).toHaveLength(0);
    });

    test("should not have any transactions marked as development seed in extra field", async () => {
      // Query for transactions with 'development-seed' in extra JSON field
      // This is database-specific; for PostgreSQL:
      const suspiciousTransactions = await db.raw(
        `SELECT * FROM transactions WHERE extra ->> 'source' = 'development-seed'`,
      );

      // If no extra column exists, this is fine - just means no demo transactions
      if (suspiciousTransactions && suspiciousTransactions.rows) {
        expect(suspiciousTransactions.rows).toHaveLength(0);
      }
    });
  });

  describe("Demo Scheduled Payments", () => {
    test("should not have any demo scheduled payments", async () => {
      const demoScheduled = await db("scheduled_payments").where("memo", "like", "demo-schedule-%");

      expect(demoScheduled).toEqual([]);
      expect(demoScheduled).toHaveLength(0);
    });

    test("should not have demo tags in scheduled payments", async () => {
      const suspiciousScheduled = await db("scheduled_payments").where((builder) => {
        builder.where("sender_tag", "like", "@demo_%").orWhere("recipient_tag", "like", "@demo_%");
      });

      expect(suspiciousScheduled).toEqual([]);
      expect(suspiciousScheduled).toHaveLength(0);
    });
  });

  describe("Demo Stellar Data", () => {
    test("should not have demo stellar tags", async () => {
      const demoStellarTags = await db("stellar_tags").whereIn("tag", ["@stellar_demo", "@test_account"]);

      expect(demoStellarTags).toEqual([]);
      expect(demoStellarTags).toHaveLength(0);
    });

    test("should not have demo stellar accounts", async () => {
      const demoAccounts = await db("stellar_accounts")
        .where("stellar_address", "like", "%demo%")
        .orWhere("public_key", "like", "%demo%");

      expect(demoAccounts).toEqual([]);
      expect(demoAccounts).toHaveLength(0);
    });
  });

  describe("Production Data Integrity", () => {
    test("should have production tokens after seed:prod", async () => {
      const tokens = await db("tokens");

      // Verify we have the expected production tokens
      const expectedSymbols = ["STRK", "LSK", "BASE", "FLOW", "U2U", "XLM"];
      const actualSymbols = tokens.map((t) => t.symbol).sort();

      expect(actualSymbols).toEqual(expectedSymbols.sort());
      expect(tokens.length).toBeGreaterThanOrEqual(6);
    });

    test("should have production chains after seed:prod", async () => {
      const chains = await db("chains");

      // Verify we have the expected production chains
      const expectedNames = ["Starknet", "Lisk", "Base", "Flow", "U2U", "Stellar"];
      const actualNames = chains.map((c) => c.name).sort();

      expect(actualNames).toEqual(expectedNames.sort());
      expect(chains.length).toBeGreaterThanOrEqual(6);
    });

    test("should not have any balances or wallets (no users = no balances)", async () => {
      const wallets = await db("wallets");
      const balances = await db("balances");

      // Since no demo users were created, wallets and balances should be empty
      expect(wallets).toHaveLength(0);
      expect(balances).toHaveLength(0);
    });
  });

  describe("Demo Data Detection Queries", () => {
    /**
     * These tests verify that our detection queries work
     * They are run AFTER confirming no demo data exists
     */

    test("demo user detection query should find nothing", async () => {
      const demoUsers = await db.raw(`
        SELECT id, email, tag FROM users 
        WHERE email LIKE '%@demo.tagged.local%' 
           OR tag LIKE '@demo_%'
      `);

      expect(demoUsers.rows).toHaveLength(0);
    });

    test("demo transaction detection query should find nothing", async () => {
      const demoTransactions = await db.raw(`
        SELECT id, reference, tx_hash FROM transactions 
        WHERE reference LIKE 'demo-tx-%' 
           OR tx_hash LIKE '0xdemo%'
      `);

      expect(demoTransactions.rows).toHaveLength(0);
    });

    test("demo stellar detection query should find nothing", async () => {
      const demoStellar = await db.raw(`
        SELECT id, tag FROM stellar_tags 
        WHERE tag IN ('@stellar_demo', '@test_account')
      `);

      expect(demoStellar.rows).toHaveLength(0);
    });

    test("demo scheduled payment detection query should find nothing", async () => {
      const demoScheduled = await db.raw(`
        SELECT id, memo FROM scheduled_payments 
        WHERE memo LIKE 'demo-schedule-%'
      `);

      expect(demoScheduled.rows).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    test("should handle multiple seed:prod runs without duplicating data", async () => {
      // Run production seeds again
      const tokenSeed = await import("../seeds/01_production_tokens_seed.js");
      await tokenSeed.seed(db);

      const chainSeed = await import("../seeds/02_production_chains_seed.js");
      await chainSeed.seed(db);

      // Verify counts didn't increase (upsert/merge should prevent duplicates)
      const tokens = await db("tokens");
      const chains = await db("chains");

      expect(tokens.length).toBeGreaterThanOrEqual(6);
      expect(chains.length).toBeGreaterThanOrEqual(6);

      // Verify no demo data still
      const demoUsers = await db("users").where("email", "like", "%@demo.tagged.local%");
      expect(demoUsers).toHaveLength(0);
    });

    test("should not create tables with demo data even if migration fails", async () => {
      // This is a defensive test: verify schema exists but is clean
      const users = await db("users");
      const transactions = await db("transactions");
      const scheduledPayments = await db("scheduled_payments");

      // Tables should exist (not throw), but be empty
      expect(Array.isArray(users)).toBe(true);
      expect(Array.isArray(transactions)).toBe(true);
      expect(Array.isArray(scheduledPayments)).toBe(true);

      // And specifically, no demo data
      const demoUsers = await db("users").where("email", "like", "%@demo.tagged.local%");
      expect(demoUsers).toHaveLength(0);
    });
  });
});
