#!/usr/bin/env node
/**
 * scripts/publish-issues.js
 *
 * Idempotent CLI tool to publish GitHub issue drafts from a JSONL or JSON
 * file.  Supports dry-run, start/resume checkpoints, rate-limit handling, and
 * a machine-readable JSON report.
 *
 * Usage:
 *   node scripts/publish-issues.js --file issues/drafts.jsonl [options]
 *
 * Options:
 *   --file <path>          Path to the drafts file (JSON array or JSONL).
 *   --dry-run              Validate drafts and report without creating issues.
 *   --checkpoint <path>    Path to the checkpoint state file (default:
 *                          .publish-checkpoint.json).
 *   --report <path>        Write a machine-readable JSON report to this path.
 *   --delay <ms>           Delay in milliseconds between API calls (default: 1000).
 *   --repo <owner/repo>    Target repository (default: env GITHUB_REPOSITORY).
 *   --token <token>        GitHub PAT (default: env GITHUB_TOKEN).
 *   --help                 Show this help.
 *
 * Exit codes:
 *   0 — all items processed successfully (or dry-run passed)
 *   1 — validation errors (no mutations occurred)
 *   2 — partial failure (some items failed, report contains details)
 *
 * Closes #522
 */

import fs from "fs";
import path from "path";
import https from "https";
import { parseArgs } from "util";

// ── CLI argument parsing ─────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    file:       { type: "string" },
    "dry-run":  { type: "boolean", default: false },
    checkpoint: { type: "string", default: ".publish-checkpoint.json" },
    report:     { type: "string" },
    delay:      { type: "string", default: "1000" },
    repo:       { type: "string" },
    token:      { type: "string" },
    help:       { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (args.help) {
  console.log(`
Usage: node scripts/publish-issues.js --file <drafts> [options]

Options:
  --file <path>          Path to JSON array or JSONL drafts file (required)
  --dry-run              Validate and count without creating issues
  --checkpoint <path>    Resume state file (default: .publish-checkpoint.json)
  --report <path>        Write JSON report to this file
  --delay <ms>           Milliseconds between API calls (default: 1000)
  --repo <owner/repo>    Target repository (default: \$GITHUB_REPOSITORY)
  --token <token>        GitHub PAT (default: \$GITHUB_TOKEN)
  --help                 Show this help
`);
  process.exit(0);
}

// ── Configuration ────────────────────────────────────────────────────────────

const GITHUB_TOKEN = args.token || process.env.GITHUB_TOKEN;
const GITHUB_REPO  = args.repo  || process.env.GITHUB_REPOSITORY;
const DRAFT_FILE   = args.file;
const DRY_RUN      = args["dry-run"];
const CHECKPOINT_FILE = args.checkpoint;
const REPORT_FILE  = args.report;
const DELAY_MS     = parseInt(args.delay, 10) || 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function die(msg, code = 1) {
  console.error(`\n[ERROR] ${msg}`);
  process.exit(code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimal HTTPS request wrapper (no external deps).
 * Returns { status, headers, body }.
 */
function request(method, url, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "tagged-issue-publisher/1.0",
        ...headers,
      },
    };
    if (bodyStr) {
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      );
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * GitHub API call with automatic retry on 429 (rate limit).
 */
async function githubRequest(method, endpoint, body) {
  if (!GITHUB_TOKEN) die("GITHUB_TOKEN is required. Set --token or $GITHUB_TOKEN.");
  const url = `https://api.github.com${endpoint}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const bodyStr = body ? JSON.stringify(body) : undefined;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request(method, url, headers, bodyStr);

    if (res.status === 429 || res.status === 403) {
      const retryAfter = parseInt(res.headers["retry-after"] || "60", 10);
      const resetAt    = parseInt(res.headers["x-ratelimit-reset"] || "0", 10);
      const waitSec    = retryAfter || Math.max(0, resetAt - Math.floor(Date.now() / 1000)) || 60;
      console.warn(`  Rate limited — waiting ${waitSec}s before retry…`);
      await sleep(waitSec * 1000);
      continue;
    }

    let parsed;
    try { parsed = JSON.parse(res.body); } catch { parsed = res.body; }
    return { status: res.status, data: parsed };
  }
  throw new Error("Max retry attempts exceeded for rate limiting.");
}

// ── Draft loading & validation ───────────────────────────────────────────────

/**
 * Load issue drafts from a JSON array file or JSONL file.
 */
function loadDrafts(filePath) {
  if (!filePath) die("--file is required.");
  if (!fs.existsSync(filePath)) die(`Draft file not found: ${filePath}`);

  const raw = fs.readFileSync(filePath, "utf8").trim();
  let drafts;

  if (raw.startsWith("[")) {
    // JSON array
    try { drafts = JSON.parse(raw); } catch (e) { die(`Invalid JSON in ${filePath}: ${e.message}`); }
  } else {
    // JSONL — one object per line
    drafts = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        try { return JSON.parse(line); }
        catch (e) { die(`Invalid JSON on line ${i + 1} of ${filePath}: ${e.message}`); }
      });
  }

  if (!Array.isArray(drafts)) die("Draft file must contain a JSON array or JSONL objects.");
  return drafts;
}

/**
 * Validate a single draft.  Returns an array of error strings.
 */
function validateDraft(draft, index) {
  const errors = [];
  if (!draft.title || typeof draft.title !== "string" || !draft.title.trim()) {
    errors.push(`[${index}] 'title' is required and must be a non-empty string.`);
  }
  if (!draft.body || typeof draft.body !== "string" || !draft.body.trim()) {
    errors.push(`[${index}] 'body' is required and must be a non-empty string.`);
  }
  if (draft.labels !== undefined) {
    if (!Array.isArray(draft.labels)) {
      errors.push(`[${index}] 'labels' must be an array of strings.`);
    } else if (draft.labels.some((l) => typeof l !== "string")) {
      errors.push(`[${index}] All items in 'labels' must be strings.`);
    }
  }
  if (draft.assignees !== undefined && !Array.isArray(draft.assignees)) {
    errors.push(`[${index}] 'assignees' must be an array of strings.`);
  }
  return errors;
}

// ── Checkpoint I/O ───────────────────────────────────────────────────────────

function loadCheckpoint(file) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return {}; }
  }
  return {};
}

function saveCheckpoint(file, state) {
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

// ── Existing issue fetching ──────────────────────────────────────────────────

/**
 * Fetch the titles of all existing open and closed issues for the repo.
 * Uses pagination so large repos are handled correctly.
 */
async function fetchExistingTitles(repo) {
  const titles = new Set();
  for (const state of ["open", "closed"]) {
    let page = 1;
    while (true) {
      const { status, data } = await githubRequest(
        "GET",
        `/repos/${repo}/issues?state=${state}&per_page=100&page=${page}`
      );
      if (status !== 200) break;
      if (!Array.isArray(data) || data.length === 0) break;
      for (const issue of data) {
        titles.add(issue.title.trim().toLowerCase());
      }
      if (data.length < 100) break;
      page++;
      await sleep(DELAY_MS);
    }
  }
  return titles;
}

// ── Core publish logic ───────────────────────────────────────────────────────

async function main() {
  // 1. Validate runtime config
  if (!GITHUB_REPO) die("GitHub repository is required. Set --repo or $GITHUB_REPOSITORY (format: owner/repo).");

  // 2. Load and validate drafts
  const drafts = loadDrafts(DRAFT_FILE);
  console.log(`\nLoaded ${drafts.length} draft(s) from ${DRAFT_FILE}`);

  const validationErrors = [];
  for (let i = 0; i < drafts.length; i++) {
    validationErrors.push(...validateDraft(drafts[i], i + 1));
  }
  if (validationErrors.length > 0) {
    console.error("\nValidation errors:");
    validationErrors.forEach((e) => console.error("  " + e));
    die(`Found ${validationErrors.length} validation error(s). No issues were created.`, 1);
  }

  // 3. Dry-run mode: report count and exit
  if (DRY_RUN) {
    console.log(`\n[DRY RUN] All ${drafts.length} draft(s) are valid.`);
    console.log("[DRY RUN] No issues will be created.");
    if (REPORT_FILE) {
      const report = {
        mode: "dry-run",
        timestamp: new Date().toISOString(),
        total: drafts.length,
        valid: drafts.length,
        errors: [],
        created: [],
        skipped: [],
        failed: [],
      };
      fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
      console.log(`[DRY RUN] Report written to ${REPORT_FILE}`);
    }
    process.exit(0);
  }

  // 4. Fetch existing issue titles for deduplication
  console.log(`\nFetching existing issues from ${GITHUB_REPO}…`);
  const existingTitles = await fetchExistingTitles(GITHUB_REPO);
  console.log(`  Found ${existingTitles.size} existing issue(s).`);

  // 5. Load checkpoint (resume support)
  const checkpoint = loadCheckpoint(CHECKPOINT_FILE);
  console.log(`  Checkpoint: ${Object.keys(checkpoint).length} item(s) already processed.`);

  // 6. Process drafts
  const report = {
    mode: "publish",
    timestamp: new Date().toISOString(),
    total: drafts.length,
    created: [],
    skipped: [],
    failed: [],
  };

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const key = `draft_${i + 1}`;
    const titleNorm = (draft.title || "").trim().toLowerCase();

    // Already processed in a previous run?
    if (checkpoint[key]) {
      console.log(`  [${i + 1}/${drafts.length}] Skipping (checkpointed): "${draft.title}"`);
      report.skipped.push({ index: i + 1, title: draft.title, reason: "checkpointed" });
      continue;
    }

    // Duplicate title?
    if (existingTitles.has(titleNorm)) {
      console.log(`  [${i + 1}/${drafts.length}] Skipping (duplicate title): "${draft.title}"`);
      report.skipped.push({ index: i + 1, title: draft.title, reason: "duplicate_title" });
      checkpoint[key] = { status: "skipped", reason: "duplicate_title" };
      saveCheckpoint(CHECKPOINT_FILE, checkpoint);
      continue;
    }

    // Create the issue
    try {
      console.log(`  [${i + 1}/${drafts.length}] Creating: "${draft.title}"`);
      const payload = {
        title: draft.title.trim(),
        body: draft.body.trim(),
        labels: draft.labels || [],
        assignees: draft.assignees || [],
      };

      const { status, data } = await githubRequest(
        "POST",
        `/repos/${GITHUB_REPO}/issues`,
        payload
      );

      if (status === 201) {
        console.log(`    → Created #${data.number}: ${data.html_url}`);
        report.created.push({ index: i + 1, title: draft.title, number: data.number, url: data.html_url });
        existingTitles.add(titleNorm); // prevent intra-run duplicates
        checkpoint[key] = { status: "created", number: data.number, url: data.html_url };
      } else {
        const msg = data?.message || JSON.stringify(data);
        console.error(`    → Failed (HTTP ${status}): ${msg}`);
        report.failed.push({ index: i + 1, title: draft.title, status, message: msg });
        checkpoint[key] = { status: "failed", httpStatus: status, message: msg };
      }
    } catch (err) {
      console.error(`    → Exception: ${err.message}`);
      report.failed.push({ index: i + 1, title: draft.title, error: err.message });
      checkpoint[key] = { status: "error", message: err.message };
    }

    saveCheckpoint(CHECKPOINT_FILE, checkpoint);
    await sleep(DELAY_MS);
  }

  // 7. Summary
  console.log(`
Summary:
  Total:   ${report.total}
  Created: ${report.created.length}
  Skipped: ${report.skipped.length}
  Failed:  ${report.failed.length}
`);

  if (REPORT_FILE) {
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
    console.log(`Report written to ${REPORT_FILE}`);
  }

  // Clean up checkpoint if everything succeeded
  if (report.failed.length === 0 && fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
    console.log("Checkpoint file removed (all items processed successfully).");
  }

  process.exit(report.failed.length > 0 ? 2 : 0);
}

main().catch((err) => die(err.message));
