# Contributing

Thanks for your interest in contributing! This document describes how to set up
the project, run the checks, and submit changes.

## Getting started

1. Fork the repository and create a feature branch off `main`.
2. Make your changes, keeping commits focused and scoped to a single issue.
3. Run the local checks (see below) before opening a pull request.
4. Open a pull request describing the change and linking the relevant issue.

## Local checks

Run the standard checks before submitting:

```sh
# Rust / Soroban
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

## Rust contract documentation generation

Rust/Soroban contracts in this repository generate their API documentation
deterministically so that reviewers and downstream consumers can verify that a
released artifact matches the source it was built from. The generation flow is
pinned, validated, and reversible.

### Pinned inputs

Documentation builds must be reproducible. Pin the following inputs and record
them alongside the generated artifact:

- **Toolchain**: the exact Rust toolchain from `rust-toolchain.toml`
  (channel + components). Do not rely on a floating `stable`.
- **Dependencies**: the committed `Cargo.lock`. Documentation is generated with
  `--locked` so the resolved dependency graph cannot drift.
- **Generator**: the `cargo-doc` / `rustdoc` version shipped with the pinned
  toolchain, plus any documentation tooling pinned in the workspace manifest.

Any change to a pinned input is a change to the artifact identity and must be
called out in the pull request.

### Artifact identity

Generated documentation is content-addressed so that identical inputs always
produce an identical identity:

- Generate docs into a clean output directory.
- Compute a deterministic digest over the generated files (sorted paths, file
  contents, and the recorded pinned inputs).
- Publish the digest as the artifact identity (e.g. `docs-<digest>`), and store
  it with the release metadata.

Because the digest covers both the generated content and the pinned inputs, a
mismatch between a released artifact and a rebuild from the same commit is a
hard failure, not a warning.

### Environment validation

Before generating or releasing documentation, validate the environment:

- The active toolchain matches `rust-toolchain.toml`.
- `Cargo.lock` is present and unmodified relative to the commit being built.
- The output directory is clean (no stale artifacts from a previous run).
- Required documentation tooling is available and reports the expected version.

Validation failures abort the run before any artifact is produced or released.

### Release approval

Documentation artifacts are released only after:

- Environment validation passes.
- The artifact identity is computed and recorded.
- A reviewer approves the release, confirming the identity matches the source
  commit and the pinned inputs.

### Rollback

If a released documentation artifact is found to be incorrect:

1. Revert the release to the previously approved artifact identity.
2. Re-run generation from the affected commit to confirm the failure is
   reproducible.
3. Fix the source or pinned inputs, regenerate, and re-approve through the
   normal release flow.

Rollback restores the last known-good identity; it never mutates a published
artifact in place.

### Tests

Documentation generation is covered by tests for the success path, boundary
inputs, unauthorized release attempts, replay of an existing identity, and
failure paths (missing lockfile, toolchain mismatch, dirty output directory).
Add or update tests alongside any change to the generation flow.

## Submitting changes

- Keep pull requests scoped to a single issue.
- Update documentation when behavior changes.
- Ensure all local checks pass before requesting review.
