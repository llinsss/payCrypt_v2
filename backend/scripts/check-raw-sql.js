#!/usr/bin/env node
/**
 * Guard against string-interpolated raw SQL.
 *
 * Knex parameterises ordinary query-builder calls, but the `raw` family takes
 * SQL verbatim. Interpolating a value into that SQL — `` knex.raw(`... ${id}`) ``
 * — reintroduces SQL injection no matter how safe the surrounding builder is.
 *
 * This script fails when it finds interpolation inside a raw call, so the
 * pattern cannot come back unnoticed. Run it directly or via
 * `npm run check:raw-sql`; wire it into a pre-commit hook to catch it earlier.
 *
 * Migrations and one-off scripts are excluded: they run from trusted local
 * input, never from request data, and they legitimately build DDL as text.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(HERE, "..");

/** Directories never scanned. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "coverage",
  "dist",
  "build",
  "migrations",
  "seeds",
  "scripts",
  "tests",
]);

/** The Knex methods that accept SQL as text. */
const RAW_METHODS = [
  "raw",
  "whereRaw",
  "orWhereRaw",
  "havingRaw",
  "groupByRaw",
  "orderByRaw",
  "joinRaw",
  "selectRaw",
];

/**
 * A raw call whose first argument is a template literal containing `${`.
 *
 * Template literals without interpolation are fine — they are just strings, and
 * multi-line SQL reads better that way — so the `${` is what makes it a finding.
 */
const RAW_CALL = new RegExp(
  `\\.(?:${RAW_METHODS.join("|")})\\(\\s*\`[^\`]*\\$\\{`,
  "g",
);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".js")) {
      yield full;
    }
  }
}

const findings = [];

for (const file of walk(BACKEND_ROOT)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    // Allow an explicit, reviewed opt-out on the offending line.
    if (line.includes("check-raw-sql-allow")) return;

    RAW_CALL.lastIndex = 0;
    if (RAW_CALL.test(line)) {
      findings.push({
        file: relative(BACKEND_ROOT, file),
        line: index + 1,
        text: line.trim(),
      });
    }
  });
}

if (findings.length === 0) {
  console.log("check-raw-sql: no interpolated raw SQL found.");
  process.exit(0);
}

console.error(
  `check-raw-sql: found ${findings.length} interpolated raw SQL call(s).\n`,
);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}`);
  console.error(`    ${finding.text}\n`);
}
console.error(
  "Pass values as bindings instead of interpolating them:\n" +
    "  bad   knex.raw(`SELECT * FROM t WHERE id = ${id}`)\n" +
    "  good  knex.raw('SELECT * FROM t WHERE id = ?', [id])\n\n" +
    "Identifiers cannot be bound as values — if you must interpolate a column or\n" +
    "table name, validate it against an allow-list first and add a\n" +
    "`check-raw-sql-allow` comment on the line explaining why it is safe.",
);
process.exit(1);
