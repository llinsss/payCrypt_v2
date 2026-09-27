# Contributing

Thanks for your interest in contributing! This document covers the basics of
setting up a development environment, running the test suites, and the
policies we follow for dependency and toolchain management.

## Getting started

1. Fork and clone the repository.
2. Install dependencies for the language(s) you are working in (see below).
3. Create a branch, make your changes, and open a pull request.

## Rust / Soroban contracts

Contracts live under `contracts/`. Rust and Soroban builds are pinned so that
generated WASM and authorization behavior cannot silently change between
machines or CI runs.

### Toolchain

The Rust toolchain is pinned in `rust-toolchain.toml` at the repository root.
`rustup` will automatically install and use the pinned channel, components, and
targets when you run any `cargo` command inside the repository. Do not override
the channel locally (for example with `rustup override set`) when preparing a
pull request.

### Soroban SDK versions

The Soroban SDK is pinned to an exact version in each contract's `Cargo.toml`
(for example `soroban-sdk = "=21.7.7"`). Exact pins are intentional: a minor or
patch bump can change generated WASM or authorization behavior, so upgrades must
be deliberate and reviewed.

### Lockfiles

`Cargo.lock` is checked in for the Rust/Soroban workspace and must not be
git-ignored. Commit lockfile changes alongside the `Cargo.toml` changes that
caused them so builds are reproducible.

### Upgrading the toolchain or Soroban SDK

When upgrading either the Rust toolchain or the Soroban SDK:

1. Update the pin in `rust-toolchain.toml` and/or the relevant `Cargo.toml`.
2. Run `cargo update -p soroban-sdk` (or the affected crate) to refresh
   `Cargo.lock`, and commit the resulting lockfile.
3. Rebuild all contracts and run the full contract test suite.
4. Verify compatibility: confirm the pinned toolchain still satisfies the
   `rust-version` / edition requirements of the Soroban SDK, and that the SDK
   version is supported by the target network's protocol version.
5. Call out the upgrade and any behavior changes in the pull request
   description so reviewers can assess the impact on generated WASM and
   authorization logic.

Keep toolchain and SDK upgrades in dedicated pull requests rather than mixing
them with unrelated feature work.

## Pull requests

- Keep changes focused and scoped to a single issue.
- Include tests for new behavior where practical.
- Make sure the relevant test suites pass before requesting review.
