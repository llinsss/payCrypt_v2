# Toolchain versions

payCrypt_v2 spans several toolchains. To get reproducible builds across machines
and CI, every supported tool version is pinned in machine-readable files at the
repository root:

| Tool        | Version file      | Pinned version | Install helper                         |
|-------------|-------------------|----------------|----------------------------------------|
| Node.js     | `.nvmrc`          | `20` (20.18.0) | `nvm install` / `asdf install`        |
| npm         | (implied by node) | bundled w/ 20  | —                                      |
| Foundry     | `.tool-versions`  | `1.0.0`        | `foundryup -v 1.0.0`                   |
| Scarb       | `.tool-versions`  | `2.11.4`       | `asdf install scarb 2.11.4`            |
| Cairo       | `.tool-versions`  | `2.11.4`       | `asdf install cairo 2.11.4`            |

The Cairo contract also pins its dependencies in `contracts/starknet_contract/Scarb.lock`,
which is committed so `scarb build` resolves identical dependencies offline.

## Using asdf (recommended)

```bash
asdf install            # reads .tool-versions
```

## Using nvm

```bash
nvm install              # reads .nvmrc
nvm use
```

## Verifying versions

`scripts/check-versions.sh` compares the installed toolchain against the pinned
values and fails with the expected vs. actual version on any mismatch:

```bash
bash scripts/check-versions.sh
```

## CI

CI runs `bash scripts/check-versions.sh` before building so an outdated runner
fails fast with a clear message instead of producing a subtly different build.
