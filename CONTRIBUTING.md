# Contributing

Thanks for your interest in contributing! This document covers the basics of
working in this repository.

## Getting started

1. Fork and clone the repository.
2. Install the toolchain pinned in `rust-toolchain.toml`.
3. Run the test suite before opening a pull request.

## Tag normalization security assumptions

Tags are user-supplied identifiers that are stored, indexed, and compared by the
contract. Because Unicode contains many visually identical or semantically
equivalent sequences, the contract applies a strict, documented normalization
and confusable policy so that clients and indexers can reason about tag
identity deterministically.

### Accepted Unicode subset

- Tags are restricted to a conservative, ASCII-first subset: letters `A-Z`
  `a-z`, digits `0-9`, and the separators `-` and `_`.
- Any codepoint outside this subset is rejected. This includes combining marks,
  zero-width characters, bidirectional control characters, and non-ASCII
  scripts. Rejecting them up front avoids homoglyph and invisible-character
  attacks that would otherwise require a full confusables table.
- Tags must be non-empty and within the configured maximum length. Length is
  measured in Unicode scalar values after normalization.

### Normalization form

- Tags are normalized to **NFC** (Canonical Composition) before validation,
  storage, and comparison. Normalization happens once, at the contract entry
  point, so every downstream read/write path observes the same canonical form.
- Because the accepted subset is ASCII-only, NFC is effectively a no-op for
  valid tags; it exists to make the rejection of non-ASCII input explicit and to
  keep behavior stable if the subset is ever widened.
- Clients should pre-normalize to NFC before sending a tag. Sending an
  already-NFC tag is always safe; sending a non-NFC tag that normalizes into the
  accepted subset is accepted, and the stored value is the NFC form.

### Confusable / skeleton policy

- The contract does not maintain a confusables table. Instead, it relies on the
  ASCII-only subset above: any codepoint that could be confused with an ASCII
  character (Cyrillic `а`, Greek `ο`, fullwidth forms, etc.) is rejected because
  it is not in the subset.
- This is a deliberate trade-off: a small, auditable allowlist is easier to
  reason about than a large confusables database, and it keeps per-invocation
  work bounded (no table lookups, no unbounded normalization passes).
- Case is preserved as sent; the contract does not case-fold tags. Clients that
  need case-insensitive matching must normalize case themselves and document
  that choice.

### Compatibility implications for clients

- Send tags as ASCII `[A-Za-z0-9_-]+`. Anything else is rejected with the
  contract's invalid-tag error.
- Pre-normalize to NFC if you generate tags from user input; the contract will
  normalize again, but doing it client-side keeps error messages predictable.
- Do not rely on case-insensitive uniqueness. `Foo` and `foo` are distinct tags.
- If a tag is rejected, treat it as a client-side validation failure rather than
  a transient error; retrying the same input will not succeed.

## Pull requests

- Keep changes focused; one logical change per pull request.
- Add tests for new behavior, including boundary and failure cases.
- Update documentation when externally visible behavior changes.
