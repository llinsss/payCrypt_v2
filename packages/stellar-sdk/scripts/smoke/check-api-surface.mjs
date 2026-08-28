// #620: validates the freshly-built dist against api-surface.json — the
// package's declared public API. Run in CI right after `npm run build`
// (i.e. against local dist, before packing/publishing) as a compatibility
// gate: it fails the build if an export is silently removed/renamed, or if
// a new export shows up that hasn't been deliberately added to the
// baseline.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');

const baseline = JSON.parse(
  readFileSync(path.join(pkgRoot, 'api-surface.json'), 'utf8')
);

const distEsm = path.join(pkgRoot, 'dist', 'index.mjs');
const distCjs = path.join(pkgRoot, 'dist', 'index.js');
const distTypes = path.join(pkgRoot, 'dist', 'index.d.ts');

for (const file of [distEsm, distCjs, distTypes]) {
  if (!existsSync(file)) {
    console.error(`[api-surface] missing build output: ${path.relative(pkgRoot, file)}`);
    process.exit(1);
  }
}

const mod = await import(distEsm);
const actual = Object.keys(mod).sort();
const expected = [...baseline.exports].sort();

const missing = expected.filter((name) => !actual.includes(name));
const added = actual.filter((name) => !expected.includes(name));

let failed = false;

if (missing.length > 0) {
  console.error('[api-surface] BREAKING: exports removed from the public API:', missing);
  failed = true;
}

if (added.length > 0) {
  console.error(
    '[api-surface] New exports are not declared in api-surface.json:',
    added,
    '\nIf this addition is intentional, add the name(s) to api-surface.json.'
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(`[api-surface] OK — ${actual.length} exports match the declared baseline.`);
