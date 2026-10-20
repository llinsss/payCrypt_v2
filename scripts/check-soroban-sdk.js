#!/usr/bin/env node
/**
 * scripts/check-soroban-sdk.js
 *
 * Audits every `soroban-sdk` declaration in the repository's Cargo manifests
 * against the canonical pin in contracts/soroban/compatibility.json. Every
 * crate must either use the canonical pin or appear in `sdk_exceptions` with
 * the exact requirement it declares today. Lockfiles listed under `lockfiles`
 * must resolve soroban-sdk to the canonical version.
 *
 * Exit codes:
 *   0 — all declarations are aligned or documented as exceptions
 *   1 — undocumented drift, stale exception, or lockfile mismatch
 *
 * Usage:
 *   node scripts/check-soroban-sdk.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX_PATH = path.join(REPO_ROOT, "contracts", "soroban", "compatibility.json");
const SKIP_DIRS = new Set(["node_modules", "target", ".git", "dist"]);
const SDK_LINE = /^soroban-sdk(\.workspace)?\s*=\s*(.+?)\s*$/;

const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
const canonical = matrix.crates["soroban-sdk"];
const canonicalVersion = canonical.replace(/^=/, "");
const exceptions = new Map(matrix.sdk_exceptions.map((e) => [e.manifest, e]));

let errors = 0;
const fail = (msg) => {
  console.error(`[FAIL] ${msg}`);
  errors++;
};

if (!canonical.startsWith("=")) {
  fail(`canonical soroban-sdk pin must be exact (=x.y.z), found '${canonical}'`);
}

function findManifests(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) findManifests(path.join(dir, entry.name), out);
    } else if (entry.name === "Cargo.toml") {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Returns the declared requirement: a version string, "workspace" for
// inherited declarations, or null when the form is not recognised.
function requirementOf(inlineName, value) {
  if (inlineName) return "workspace";
  const quoted = /^"([^"]+)"/.exec(value);
  if (quoted) return quoted[1];
  if (/\bworkspace\s*=\s*true\b/.test(value)) return "workspace";
  const version = /\bversion\s*=\s*"([^"]+)"/.exec(value);
  return version ? version[1] : null;
}

// manifest path -> Set of requirements declared in it (dependencies and dev-dependencies)
const seen = new Map();
for (const manifest of findManifests(REPO_ROOT)) {
  const rel = path.relative(REPO_ROOT, manifest).split(path.sep).join("/");
  const lines = fs.readFileSync(manifest, "utf8").split("\n");
  for (const line of lines) {
    const match = SDK_LINE.exec(line.trim());
    if (!match) continue;
    const requirement = requirementOf(match[1], match[2]);
    if (requirement === null) {
      fail(`${rel}: unrecognised soroban-sdk declaration: ${line.trim()}`);
      continue;
    }
    if (!seen.has(rel)) seen.set(rel, new Set());
    seen.get(rel).add(requirement);
  }
}

for (const [rel, requirements] of seen) {
  for (const requirement of requirements) {
    if (requirement === canonical) continue;
    const exception = exceptions.get(rel);
    if (!exception) {
      fail(`${rel}: soroban-sdk '${requirement}' does not match canonical '${canonical}' and is not in sdk_exceptions`);
    } else if (exception.requirement !== requirement) {
      fail(`${rel}: soroban-sdk is '${requirement}' but sdk_exceptions records '${exception.requirement}'`);
    } else {
      console.log(`[EXCEPTION] ${rel} = ${requirement} (${exception.reason})`);
    }
  }
}

for (const [rel, exception] of exceptions) {
  if (!seen.has(rel)) {
    fail(`${rel}: listed in sdk_exceptions but declares no soroban-sdk dependency; remove the stale entry`);
  } else if (seen.get(rel).has(canonical) && seen.get(rel).size === 1) {
    fail(`${rel}: uses the canonical pin; remove it from sdk_exceptions`);
  }
}

for (const lockfile of matrix.lockfiles) {
  const contents = fs.readFileSync(path.join(REPO_ROOT, lockfile), "utf8");
  const locked = /name = "soroban-sdk"\nversion = "([^"]+)"/.exec(contents);
  if (!locked) {
    fail(`${lockfile}: does not resolve soroban-sdk`);
  } else if (locked[1] !== canonicalVersion) {
    fail(`${lockfile}: locks soroban-sdk ${locked[1]}, expected ${canonicalVersion}`);
  } else {
    console.log(`[OK]   ${lockfile} locks soroban-sdk ${locked[1]}`);
  }
}

if (errors === 0) {
  console.log(`==> soroban-sdk declarations are aligned on ${canonical} or documented as exceptions.`);
} else {
  console.error(`==> ${errors} soroban-sdk alignment problem(s). See contracts/soroban/COMPATIBILITY.md.`);
  process.exit(1);
}
