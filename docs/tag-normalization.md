# Tag normalization and byte-length limits

This document is the reference for how a raw user-supplied tag becomes a
canonical tag in the Soroban contract, and for what an off-chain consumer has to
do to stay consistent with it.

The implementation lives in `contracts/tag/src/normalize.rs` and is the single
place in the Rust tree that defines the rules. The Solidity
`contracts/solidity_contract/src/TagRegistry.sol` and the backend validator in
`backend/validators/customValidators.js` enforce the same bounds from their own
side; this document describes the contract, which is the strictest of the three.

## Why normalization is defined here

Two facts force a canonical form, and neither can be left to the caller:

- The contract stores the tag name in a Soroban `Symbol`. A `Symbol` accepts
  only `a-zA-Z0-9_` and at most **32** characters, and `Symbol::new` *panics*
  rather than returning an error. An unvalidated tag would therefore turn a bad
  user input into a contract abort.
- The Solidity registry enforces `0 < bytes(tag).length <= 32`.

Canonical form is a strict subset of what a `Symbol` accepts, so a canonical tag
is always representable as a `Symbol` and always satisfies the Solidity bound.
That is what lets `"Ada"`, `"@Ada"`, `"@ada"` and `"  ADA  "` all resolve to the
single stored value `ada`.

## Canonical form

The steps run in this order. This is the *only* accepted normalization.

| # | Step | Rule |
|---|------|------|
| 1 | ASCII gate | The first non-ASCII byte is rejected. |
| 2 | Trim | Leading and trailing ASCII whitespace is removed. |
| 3 | Prefix | At most **one** leading `@` is stripped. |
| 4 | Length | The surviving span must be 1–32 bytes. |
| 5 | Charset | Every remaining byte is ASCII-lowercased, then must be in `[a-z0-9_]`. |

Two ordering choices are load-bearing:

- **The length bound is checked before the charset** (step 4 before step 5). An
  over-long input therefore reports `too_long` even when it also contains bytes
  outside `[a-z0-9_]`. Reporting the dominant reason keeps the rejection reason
  stable under further padding, so an error code stays a useful monitoring
  dimension.
- **The `@` is stripped after trimming, and only once.** `@@name` does not
  normalize to `name`; the second `@` survives to the charset check and is
  rejected.

Normalization is a **total** function: every possible byte string maps either to
a canonical tag or to a deterministic error. It never panics, never allocates,
and never reads ledger state, so the same input produces the same result
on-chain, in `cargo test`, in a fuzz target, and in an indexer.

### Why the ASCII gate is a gate and not a fold

Rejecting the first non-ASCII byte makes byte length equal character length, and
makes Unicode confusables *unrepresentable* rather than merely discouraged. The
classic confusables for ASCII `a` — Cyrillic `а` (U+0430), fullwidth `ａ`
(U+FF41), and zero-width joiners (U+200D) — are all rejected outright. An
indexer that folds them would disagree with the contract, and a tag that looks
identical to a user but is a different `Symbol` is the exact confusion this
contract needs to prevent.

## Limits

| Constant | Value | Meaning |
|----------|-------|---------|
| `MIN_TAG_BYTES` | 1 | Shortest accepted canonical tag. |
| `MAX_TAG_BYTES` | 32 | Longest accepted canonical tag. Matches the `Symbol` limit and the Solidity bound. |
| `MAX_RAW_SCAN_BYTES` | 64 | Longest raw input a single call will inspect. |

`MAX_RAW_SCAN_BYTES` is a resource guard, not a statement about the tag. It is
checked first, before any other rule, so an untrusted caller cannot burn
unbounded CPU by submitting an arbitrarily long string. The gap between 32 and
64 is deliberate: whitespace is trimmed, so a 32-byte tag surrounded by one byte
of padding on each side is a legitimate 36-byte input and is accepted.

The two limits are independent, which is worth stating explicitly because it is
a common source of off-by-one confusion:

| Raw input | Result | Why |
|-----------|--------|-----|
| 32 × `a` | accepted, length 32 | At the tag limit. |
| 33 × `a` | `too_long` (33) | Over the tag limit, within the scan limit. |
| `"  " + 32 × "a" + "  "` | accepted, length 32 | Padding is trimmed first. |
| 64 × `a` | `too_long` (64) | Over the tag limit; the scan guard does not fire. |
| 65 × `a` | `input_too_long` (65) | The scan guard fires before anything else. |
| 64 spaces | `empty` | Trims to nothing. |

## Errors

Every rejection is a `TagNameError` with a stable numeric code. The codes are
appended to and never renumbered, so they are safe to use as event topics,
indexer dimensions, and metric labels.

| Code | Variant | Meaning |
|------|---------|---------|
| 1 | `empty` | Normalized to nothing (`""`, `"@"`, `"   "`, `"@  "`). |
| 2 | `input_too_long` | The raw input exceeded 64 bytes. A resource guard, not a tag defect. |
| 3 | `non_ascii` | A non-ASCII byte was found. Carries the byte offset and the byte. |
| 4 | `disallowed_byte` | A byte outside `[a-z0-9_]` survived folding. Carries the offset and the byte. |
| 5 | `too_long` | The post-trim, post-prefix span exceeded 32 bytes. |

Error offsets are indices into the **original** input, not into the trimmed
span, so a client can highlight the offending character in what the user
actually typed.

## Off-chain indexing

An indexer must not re-implement these rules. The safe options, in order of
preference:

1. **Index the stored value.** Read the canonical tag back from the ledger entry.
   This is always correct and costs nothing.
2. **Normalize with the same code.** If a client must predict the canonical form
   before submitting, it must produce the identical result. Divergence shows up
   as an indexer that cannot find a tag the user just created.

Do not normalize case or trim in the indexer and treat that as equivalent, and
do not apply Unicode case folding: the ASCII gate means no accepted tag ever
contains a non-ASCII byte, so a "clever" fold can only ever diverge.

If a client rejects input locally, it should reject on the *same* rule and
report the same code, so the error a user sees before submitting matches the
error they would have gotten on-chain.

## Monitoring

The error codes are the intended monitoring dimensions. In rough order of what
each one tells you:

| Signal | Reading |
|--------|---------|
| `disallowed_byte` dominant | Clients are sending punctuation, spaces, or separators inside the tag. Usually a UI problem, not an attack. |
| `too_long` dominant | Clients are pasting whole sentences or URLs into the tag field. |
| `empty` dominant | Submissions of whitespace-only or `@`-only input. |
| `non_ascii` dominant | Non-Latin input. Expected to be non-zero for a globally-used product; a sudden spike is worth a look. |
| `input_too_long` | Bounded at 64 bytes, so it should be rare. A sustained rise means something is submitting oversized values programmatically, not by hand. |
| `input_too_long` / accepted ratio | The clearest abuse signal, because no legitimate client needs to exceed 64 bytes. |

`input_too_long` deserves the most attention per event: it is the only code a
caller can hit *without* having a malformed tag, since it fires before any tag
rule is applied.

## Rollback

The canonical form is applied at the entry points and the stored value is the
canonical string, so a change to the rules is a behaviour change for new writes,
not a rewrite of existing data.

- **Reverting the rules does not corrupt existing tags.** Anything already
  stored satisfies the invariant `1..=32` bytes over `[a-z0-9_]`, so it
  re-normalizes to itself. Re-parsing a stored tag is always a no-op.
- **The `Symbol` bound is not negotiable.** Any relaxation that would admit a
  tag a `Symbol` cannot hold reintroduces the abort-on-invalid-input failure
  that canonical form exists to prevent. Raising `MAX_TAG_BYTES` past 32 is
  therefore not a supported rollback path; it would need a different storage
  type.
- **Raising `MAX_RAW_SCAN_BYTES` is safe** and affects only the resource guard.
- **Lowering either limit is a breaking change for existing clients** that
  currently submit longer or padded tags. Check `too_long` and
  `input_too_long` counts before lowering anything.
- **Widening the accepted charset is the one direction that needs care.** The
  Solidity registry and the backend validator must be widened in the same
  release, or a tag that the contract accepts will be rejected by another part
  of the system.

## Tests and fuzzing

The contract suite runs the harness with fixed seeds, so `cargo test` is
deterministic and a failure is reproducible from the printed seed alone:

```sh
cargo test --all-features
```

The coverage-guided targets live in `contracts/tag/fuzz` and are a separate
workspace with their own lockfile, excluded from the root workspace.

```sh
# Fuzz the raw normalization path with arbitrary bytes.
cargo +nightly fuzz run tag_normalization

# Fuzz the spelling variants of an accepted tag.
cargo +nightly fuzz run tag_equivalence

# Replay one minimized input.
cargo +nightly fuzz run tag_normalization fuzz/artifacts/tag_normalization/crash-<hash>

# Type-check the fuzz package without linking, on any host.
cargo +nightly check --manifest-path contracts/tag/fuzz/Cargo.toml --all-targets
```

Each target is a thin wrapper: the properties themselves live in
`contracts/tag/src/harness.rs` so the identical code runs under `cargo test` and
under the fuzzer. A failure names the violated property and prints the input.

### Host requirement for `cargo fuzz`

Run `cargo fuzz` on **Linux or macOS**.

`cargo fuzz` builds with coverage instrumentation, and it applies those flags to
the contract crate as well as to the fuzz binaries. The contract crate declares
`crate-type = ["cdylib", "rlib"]` because it is built to `wasm32-unknown-unknown`
for deployment; a `cdylib` has no `main` to instrument, so building it for the
host under libFuzzer fails to link. This is a property of the wasm build, not of
the harness, and it does not affect the contract's own build or test suite —
`cargo build --release` links the `cdylib` on Windows, Linux, and macOS alike.
On Windows, use `cargo +nightly check` on the fuzz package to verify the targets
still compile, and run the actual fuzzing on Linux or macOS (a container is
fine).
