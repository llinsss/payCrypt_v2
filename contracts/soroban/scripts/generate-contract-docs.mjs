#!/usr/bin/env node
// Generates Markdown API references for the Soroban contracts from Rust source.
//
// Usage: node scripts/generate-contract-docs.mjs [output-dir]
//   output-dir defaults to target/contract-docs (relative to contracts/soroban).
//
// Rules enforced:
//   - Every `pub fn` inside a `#[contractimpl]` block is a public entry point and
//     must carry a `///` doc comment. Undocumented entry points fail the run.
//   - At least one `#[contractimpl]` block must be found, so a parser regression
//     cannot silently produce empty docs.
//
// Output per crate: <crate>.md with entry points, error codes from
// `#[contracterror]` enums, and event types/schema versions from `event_type`
// symbols used in event structs.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, 'target', 'contract-docs'));

// Collects the `///` doc block directly above `index`, skipping attributes.
function docAbove(lines, index) {
  const doc = [];
  for (let k = index - 1; k >= 0; k--) {
    const trimmed = lines[k].trim();
    if (trimmed.startsWith('#[')) continue;
    if (!trimmed.startsWith('///')) break;
    doc.unshift(trimmed.replace(/^\/\/\/ ?/, ''));
  }
  return doc;
}

function signatureAt(lines, start) {
  const parts = [];
  for (let k = start; k < lines.length; k++) {
    const trimmed = lines[k].trim();
    parts.push(trimmed);
    if (trimmed.endsWith('{')) break;
  }
  return parts
    .join(' ')
    .replace(/\s*\{$/, '')
    .replace(/\(\s+/g, '(')
    .replace(/,?\s*\)/, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function blockEnd(lines, implIndex) {
  let depth = 0;
  let opened = false;
  for (let k = implIndex; k < lines.length; k++) {
    for (const ch of lines[k]) {
      if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
      }
    }
    if (opened && depth === 0) return k;
  }
  return lines.length - 1;
}

function parseCrate(crateDir) {
  const file = join(crateDir, 'src', 'lib.rs');
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const contracts = [];
  const errors = [];
  const undocumented = [];

  lines.forEach((line, i) => {
    if (line.trim() === '#[contractimpl]') {
      const implIndex = lines.findIndex((l, j) => j > i && /^impl\s+\w+/.test(l));
      if (implIndex === -1) return;
      const name = lines[implIndex].match(/^impl\s+(\w+)/)[1];
      const end = blockEnd(lines, implIndex);
      const entries = [];
      for (let j = implIndex + 1; j <= end; j++) {
        const fn = lines[j].match(/^\s*pub fn (\w+)\s*\(/);
        if (!fn) continue;
        const doc = docAbove(lines, j);
        const entry = {
          name: fn[1],
          signature: signatureAt(lines, j),
          doc,
          line: j + 1,
        };
        if (!doc.some((d) => d.trim())) undocumented.push({ file, ...entry });
        entries.push(entry);
      }
      contracts.push({ name, entries });
    }

    if (line.trim() === '#[contracterror]') {
      const enumIndex = lines.findIndex((l, j) => j > i && /^pub enum \w+/.test(l));
      if (enumIndex === -1) return;
      const name = lines[enumIndex].match(/^pub enum (\w+)/)[1];
      const variants = [];
      for (let j = enumIndex + 1; j < lines.length && !/^}/.test(lines[j]); j++) {
        const variant = lines[j].match(/^\s*(\w+)\s*=\s*(\d+),?\s*$/);
        if (!variant) continue;
        variants.push({
          name: variant[1],
          code: Number(variant[2]),
          doc: docAbove(lines, j).join(' ').trim(),
        });
      }
      errors.push({ name, variants });
    }
  });

  const events = [];
  const eventPattern = /(\w+)\s*\{\s*event_type:\s*Symbol::new\(&\w+,\s*"([^"]+)"\),\s*schema_version:\s*(\d+)/g;
  for (const match of source.matchAll(eventPattern)) {
    events.push({ struct: match[1], eventType: match[2], schemaVersion: match[3] });
  }

  return { file, contracts, errors, events, undocumented };
}

function renderCrate(crateName, parsed) {
  const relFile = relative(root, parsed.file);
  const out = [];
  out.push(`# ${crateName} contract reference`, '');
  out.push(`Generated from \`${relFile}\`. Do not edit by hand; regenerate with \`node contracts/soroban/scripts/generate-contract-docs.mjs\`.`, '');

  for (const contract of parsed.contracts) {
    out.push(`## Contract \`${contract.name}\``, '');
    for (const entry of contract.entries) {
      out.push(`### \`${entry.name}\``, '', '```rust', entry.signature, '```', '');
      out.push(entry.doc.join('\n').trim(), '');
    }
  }

  if (parsed.errors.length) {
    out.push('## Error codes', '');
    for (const error of parsed.errors) {
      out.push(`### \`${error.name}\``, '', '| Code | Variant | Description |', '| --- | --- | --- |');
      for (const variant of error.variants) {
        out.push(`| ${variant.code} | \`${variant.name}\` | ${variant.doc || '-'} |`);
      }
      out.push('');
    }
  }

  if (parsed.events.length) {
    out.push('## Events', '', '| Event type | Struct | Schema version |', '| --- | --- | --- |');
    for (const event of parsed.events) {
      out.push(`| \`${event.eventType}\` | \`${event.struct}\` | ${event.schemaVersion} |`);
    }
    out.push('');
  }

  return out.join('\n');
}

const crateDirs = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'target')
  .map((entry) => join(root, entry.name))
  .filter((dir) => existsSync(join(dir, 'src', 'lib.rs')))
  .sort();

const parsedCrates = crateDirs.map((dir) => ({ name: dir.split('/').pop(), parsed: parseCrate(dir) }));

const undocumented = parsedCrates.flatMap(({ parsed }) => parsed.undocumented);
for (const entry of undocumented) {
  const rel = relative(root, entry.file);
  console.log(`::error file=${rel},line=${entry.line}::Public contract entry point \`${entry.name}\` has no /// doc comment`);
}
if (undocumented.length > 0) {
  console.error(`${undocumented.length} undocumented public contract entry point(s).`);
  process.exit(1);
}

const entryPointCount = parsedCrates.reduce(
  (sum, { parsed }) => sum + parsed.contracts.reduce((n, c) => n + c.entries.length, 0),
  0,
);
if (entryPointCount === 0) {
  console.error('::error::No #[contractimpl] entry points found; refusing to publish empty contract docs.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
for (const { name, parsed } of parsedCrates) {
  if (parsed.contracts.length === 0 && parsed.errors.length === 0 && parsed.events.length === 0) continue;
  const target = join(outDir, `${name}.md`);
  writeFileSync(target, renderCrate(name, parsed));
  console.log(`wrote ${relative(root, target)}`);
}
console.log(`documented ${entryPointCount} public contract entry point(s)`);
