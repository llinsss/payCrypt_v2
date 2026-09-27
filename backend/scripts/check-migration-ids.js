#!/usr/bin/env node

/**
 * Fails when migration filenames are malformed or share an identifier,
 * which would make Knex's execution order ambiguous.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findMigrationIdProblems } from "../utils/migrationIds.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const problems = findMigrationIdProblems(fs.readdirSync(migrationsDir));

if (problems.length > 0) {
  console.error("Invalid migration identifiers:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}

console.log("Migration identifiers are unique and well-formed.");
