#!/usr/bin/env node
/**
 * Verify No Demo Data Script
 *
 * This script checks that the database contains NO demo/development data.
 * It's designed to run after production seeding to ensure demo data was never loaded.
 *
 * Usage: node scripts/verify-no-demo-data.js
 *
 * Exit codes:
 *   0 = Success (no demo data found)
 *   1 = Failure (demo data detected)
 */

import knex from "knex";
import config from "../knexfile.js";

const db = knex(config);

// ANSI color codes
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const demoDataMarkers = {
  users: {
    name: "Demo Users",
    queries: [
      {
        description: "Users with @demo.tagged.local email",
        query: () => db("users").where("email", "like", "%@demo.tagged.local%"),
      },
      {
        description: "Users with @demo_ tag",
        query: () => db("users").where("tag", "like", "@demo_%"),
      },
    ],
  },
  transactions: {
    name: "Demo Transactions",
    queries: [
      {
        description: "Transactions with demo-tx- reference",
        query: () => db("transactions").where("reference", "like", "demo-tx-%"),
      },
      {
        description: "Transactions with 0xdemo hash",
        query: () => db("transactions").where("tx_hash", "like", "0xdemo%"),
      },
      {
        description: "Transactions with 'Development demo' description",
        query: () => db("transactions").where("description", "like", "%Development demo transfer%"),
      },
    ],
  },
  scheduledPayments: {
    name: "Demo Scheduled Payments",
    queries: [
      {
        description: "Scheduled payments with demo-schedule- memo",
        query: () => db("scheduled_payments").where("memo", "like", "demo-schedule-%"),
      },
      {
        description: "Scheduled payments with @demo_ tags",
        query: () =>
          db("scheduled_payments").where((builder) => {
            builder.where("sender_tag", "like", "@demo_%").orWhere("recipient_tag", "like", "@demo_%");
          }),
      },
    ],
  },
  stellar: {
    name: "Demo Stellar Data",
    queries: [
      {
        description: "Stellar tags with @stellar_demo or @test_account",
        query: () => db("stellar_tags").whereIn("tag", ["@stellar_demo", "@test_account"]),
      },
      {
        description: "Stellar accounts with demo in address",
        query: () =>
          db("stellar_accounts").where((builder) => {
            builder.where("stellar_address", "like", "%demo%").orWhere("public_key", "like", "%demo%");
          }),
      },
    ],
  },
};

async function checkDemoData() {
  console.log(`\n${YELLOW}🔍 Verifying no demo data in database...${RESET}\n`);

  let totalIssues = 0;
  const results = [];

  for (const [category, data] of Object.entries(demoDataMarkers)) {
    console.log(`${YELLOW}${data.name}${RESET}`);

    for (const queryDef of data.queries) {
      try {
        const result = await queryDef.query();
        const count = result.length;

        if (count > 0) {
          console.log(`  ${RED}✗ ${queryDef.description}: found ${count} record(s)${RESET}`);
          totalIssues += count;
          results.push({
            category: data.name,
            check: queryDef.description,
            count,
            failed: true,
          });
        } else {
          console.log(`  ${GREEN}✓ ${queryDef.description}${RESET}`);
          results.push({
            category: data.name,
            check: queryDef.description,
            count: 0,
            failed: false,
          });
        }
      } catch (error) {
        // Table might not exist yet, which is fine
        if (error.message.includes("does not exist")) {
          console.log(`  ${YELLOW}⊘ ${queryDef.description} (table doesn't exist yet)${RESET}`);
          results.push({
            category: data.name,
            check: queryDef.description,
            count: 0,
            failed: false,
          });
        } else {
          console.log(`  ${RED}✗ ${queryDef.description} (query error: ${error.message})${RESET}`);
          totalIssues++;
          results.push({
            category: data.name,
            check: queryDef.description,
            count: 0,
            failed: true,
          });
        }
      }
    }
  }

  // Summary
  console.log(`\n${YELLOW}Summary${RESET}`);
  console.log(`${"─".repeat(60)}`);

  if (totalIssues === 0) {
    console.log(`${GREEN}✓ No demo data detected - Production seeding is clean!${RESET}\n`);
    return true;
  } else {
    console.log(`${RED}✗ Found ${totalIssues} demo data record(s) - PRODUCTION SAFETY VIOLATION${RESET}\n`);
    console.log(`${RED}FAILED CHECKS:${RESET}`);
    for (const result of results) {
      if (result.failed) {
        console.log(`  - ${result.category}: ${result.check} (${result.count} records)`);
      }
    }
    console.log();
    return false;
  }
}

async function main() {
  try {
    const success = await checkDemoData();
    await db.destroy();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`${RED}Fatal error: ${error.message}${RESET}`);
    await db.destroy();
    process.exit(1);
  }
}

main();
