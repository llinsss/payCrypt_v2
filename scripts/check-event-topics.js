#!/usr/bin/env node
/**
 * scripts/check-event-topics.js
 *
 * Fails CI when a Soroban event topic is ambiguous across contract crates.
 *
 * A topic is a `symbol_short!("…")` or `Symbol::new(env, "…")` literal that is
 * either inside a `.publish(…)` call or inside a function returning `Symbol`
 * (topic-name helpers such as payment's `event_names`). Storage keys and test
 * code (everything after `#[cfg(test)]`, and test-only files) are ignored.
 *
 * Rules:
 *   1. A topic must be 1–32 characters of [A-Za-z0-9_] (Symbol::new limit).
 *   2. A topic, compared case-insensitively, may be emitted by only one crate.
 *      Two crates sharing a topic name means an indexer cannot tell their
 *      event schemas apart.
 *
 * Exit codes:
 *   0 — no invalid or ambiguous topics
 *   1 — one or more violations (each printed with file:line)
 *
 * Usage:
 *   node scripts/check-event-topics.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");

const SKIP_DIRS = new Set(["target", "tests", "benches", "fuzz", "test-support"]);
const TOPIC_RE = /^[A-Za-z0-9_]{1,32}$/;
const SYMBOL_LITERAL_RE = /symbol_short!\("([^"]*)"\)|Symbol::new\([^()]*?"([^"]*)"\s*\)/g;
const PUBLISH_RE = /\.publish\(/g;
const SYMBOL_FN_RE = /fn\s+\w+\s*\([^)]*\)\s*->\s*Symbol\s*\{/g;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
    } else if (entry.name.endsWith(".rs") && !/test/i.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

// Returns [open, end) for the balanced `(…)` or `{…}` group starting at `open`.
function balancedSpan(src, open) {
  const close = src[open] === "(" ? ")" : "}";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++;
    else if (src[i] === close && --depth === 0) return [open, i + 1];
  }
  return [open, src.length];
}

function topicSpans(src) {
  const spans = [];
  for (const m of src.matchAll(PUBLISH_RE)) {
    spans.push(balancedSpan(src, m.index + m[0].length - 1));
  }
  for (const m of src.matchAll(SYMBOL_FN_RE)) {
    spans.push(balancedSpan(src, m.index + m[0].length - 1));
  }
  return spans;
}

function topicLiterals(src) {
  const found = new Map(); // source index -> topic name
  for (const [start, end] of topicSpans(src)) {
    for (const m of src.slice(start, end).matchAll(SYMBOL_LITERAL_RE)) {
      found.set(start + m.index, m[1] ?? m[2]);
    }
  }
  return found;
}

// Crate key is the path under contracts/ up to (not including) `src/`.
function crateOf(file) {
  const parts = path.relative(CONTRACTS_DIR, file).split(path.sep);
  const srcIdx = parts.indexOf("src");
  return parts.slice(0, srcIdx === -1 ? -1 : srcIdx).join("/");
}

const problems = [];
const owners = new Map(); // lowercased topic -> Map(crate -> [file:line])

for (const file of walk(CONTRACTS_DIR)) {
  const src = fs.readFileSync(file, "utf8");
  const testStart = src.indexOf("#[cfg(test)]");
  const code = testStart === -1 ? src : src.slice(0, testStart);
  const crate = crateOf(file);

  for (const [index, name] of topicLiterals(code)) {
    const where = `${path.relative(ROOT, file)}:${code.slice(0, index).split("\n").length}`;
    if (!TOPIC_RE.test(name)) {
      problems.push(`${where}: topic "${name}" must be 1-32 characters of [A-Za-z0-9_]`);
      continue;
    }
    const key = name.toLowerCase();
    if (!owners.has(key)) owners.set(key, new Map());
    const crates = owners.get(key);
    if (!crates.has(crate)) crates.set(crate, []);
    crates.get(crate).push(where);
  }
}

for (const [topic, crates] of owners) {
  if (crates.size < 2) continue;
  const detail = [...crates].map(([crate, wheres]) => `  ${crate}: ${wheres.join(", ")}`);
  problems.push(
    `topic "${topic}" is emitted by ${crates.size} crates; rename one so each schema has a unique topic\n${detail.join("\n")}`,
  );
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
}

console.log(`event topics OK: ${owners.size} distinct topics, no cross-crate collisions`);
