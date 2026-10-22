# Contracts

Soroban smart contracts for the Handsoff protocol.

## Layout

Each contract crate lives in its own directory under `contracts/` and builds to a
WASM artifact at `target/wasm32-unknown-unknown/release/<crate_name>.wasm`.

## Building

```sh
cargo build --target wasm32-unknown-unknown --release
```

## Release validation

Before publishing a release, run the release validation script to confirm that
every expected contract WASM artifact was built and that each contract spec is
valid:

```sh
./scripts/validate-release.sh
```

The script:

1. Checks that each expected contract crate has a corresponding WASM artifact in
   `target/wasm32-unknown-unknown/release/`.
2. Validates the contract spec for each expected contract.
3. Exits non-zero with an actionable message naming the missing crate/artifact
   when validation fails.

### Expected contracts

The list of expected contracts is defined in the script. When a new contract
crate is added, add it to that list so release validation covers it.

### Failure behavior

- **Missing artifact** — the script reports the crate name and the expected
  artifact path, and instructs you to build with
  `cargo build --target wasm32-unknown-unknown --release`.
- **Invalid spec** — the script reports which contract failed spec validation
  and exits non-zero.

## Event topic collisions

Indexers map each event to a schema by its topic name, so a topic must belong to
exactly one contract crate. CI runs:

```sh
node scripts/check-event-topics.js
```

The script collects topic names from `symbol_short!("…")` and `Symbol::new(env, "…")`
literals that are passed to `publish(...)` or returned from a `-> Symbol` helper.
Storage keys and test code are ignored. It fails when:

- **Invalid name** — a topic is empty, longer than 32 characters, or contains
  anything other than `[A-Za-z0-9_]`.
- **Ambiguous name** — two or more crates emit the same topic name. Comparison is
  case-insensitive, so `Escrow_Created` and `escrow_created` collide.

The failure output lists every `file:line` that emits the colliding topic. To fix
it, rename the topic in one crate, for example by prefixing it with the crate name
(`tag_registered` rather than `registered`). Renaming an already-deployed topic is
an externally visible event change and needs a schema version bump in the indexer.

## Testing

Run the contract test suite with:

```sh
cargo test
```

Tests cover success paths, authorization, boundary conditions, and failure
cases for each contract.
