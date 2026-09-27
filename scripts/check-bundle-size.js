#!/usr/bin/env node
/**
 * scripts/check-bundle-size.js
 *
 * Checks that the Vite production build respects the size budget defined in
 * BUNDLE_BUDGET below.  Run after `npm run build`.
 *
 * Exit codes:
 *   0 — all chunks within budget
 *   1 — one or more chunks exceed their budget
 *
 * Usage:
 *   npm run build && node scripts/check-bundle-size.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist", "assets");

/**
 * Size budget in bytes (before gzip).
 *
 * ┌─────────────────┬──────────────────────────────────────────────────┐
 * │ Chunk pattern   │ Max size (bytes)                                 │
 * ├─────────────────┼──────────────────────────────────────────────────┤
 * │ vendor-react    │ 200 kB  (React 18 + ReactDOM)                   │
 * │ vendor-router   │  80 kB  (react-router-dom)                      │
 * │ vendor-charts   │ 300 kB  (recharts + d3 internals)               │
 * │ vendor-stellar  │ 500 kB  (Stellar SDK is large)                  │
 * │ vendor-forms    │  80 kB  (react-hook-form + yup)                 │
 * │ vendor-qr       │  30 kB                                          │
 * │ vendor-utils    │  40 kB  (dayjs + luxon)                         │
 * │ vendor-ui       │  30 kB  (react-hot-toast)                       │
 * │ index (shell)   │ 100 kB  (app shell + routes)                    │
 * └─────────────────┴──────────────────────────────────────────────────┘
 *
 * Individual route chunks are not budgeted individually but the total
 * JS payload (excluding vendor-stellar) should stay under 500 kB.
 */
const BUNDLE_BUDGET = [
  { pattern: /vendor-react/,   maxBytes: 200 * 1024 },
  { pattern: /vendor-router/,  maxBytes:  80 * 1024 },
  { pattern: /vendor-charts/,  maxBytes: 300 * 1024 },
  { pattern: /vendor-stellar/, maxBytes: 500 * 1024 },
  { pattern: /vendor-forms/,   maxBytes:  80 * 1024 },
  { pattern: /vendor-qr/,      maxBytes:  30 * 1024 },
  { pattern: /vendor-utils/,   maxBytes:  40 * 1024 },
  { pattern: /vendor-ui/,      maxBytes:  30 * 1024 },
  { pattern: /^index/,         maxBytes: 100 * 1024 },
];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(`[bundle-size] dist/assets not found. Run 'npm run build' first.`);
  process.exit(1);
}

const jsFiles = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith(".js"));
let failed = false;

console.log("\nBundle size report\n" + "─".repeat(60));

for (const file of jsFiles.sort()) {
  const size = fs.statSync(path.join(DIST_DIR, file)).size;
  const budget = BUNDLE_BUDGET.find((b) => b.pattern.test(file));

  if (budget) {
    const over = size > budget.maxBytes;
    const icon = over ? "✗" : "✓";
    const msg = over
      ? ` (OVER BUDGET: max ${formatBytes(budget.maxBytes)})`
      : ` (budget: ${formatBytes(budget.maxBytes)})`;
    console.log(`  ${icon} ${file.padEnd(45)} ${formatBytes(size)}${msg}`);
    if (over) failed = true;
  } else {
    // Route-level lazy chunk — informational only
    console.log(`  · ${file.padEnd(45)} ${formatBytes(size)}`);
  }
}

console.log("─".repeat(60));
if (failed) {
  console.error("\n[bundle-size] ✗ One or more chunks exceed their size budget.");
  process.exit(1);
} else {
  console.log("\n[bundle-size] ✓ All budgeted chunks are within limits.");
}
