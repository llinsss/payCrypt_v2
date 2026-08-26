# CI Reference — Tagged

All pull requests must pass **`ci/required-checks`** before merging.  
This single check aggregates all component results. Configure branch-protection
to require only this name; individual component names are informational.

---

## Quick reference

| Stable check name | Component | Triggered by | Jobs |
|---|---|---|---|
| `ci/web` | Web frontend | `src/**`, shared config | lint, type-check, vite build |
| `ci/backend` | Node.js API | `backend/**` | lint, npm audit, jest |
| `ci/sdk` | JS/TS SDKs | `packages/**`, shared config | lint, typecheck, tsup build |
| `ci/contracts` | Smart contracts | `contracts/**` | solhint, forge, slither, snforge |
| `ci/required-checks` | Gate (always runs) | all PRs | aggregates all of the above |

---

## Path → component mapping

### Web (`ci/web`)

```
src/**
index.html
vite.config.ts
tsconfig*.json          ← shared — also triggers sdk
eslint.config.js        ← shared — also triggers sdk
tailwind.config.js
postcss.config.js
package.json            (root)
package-lock.json       (root)
.github/workflows/web-ci.yml
```

### Backend (`ci/backend`)

```
backend/**
.github/workflows/backend-ci.yml
```

### SDK (`ci/sdk`)

```
packages/**
tsconfig*.json          ← shared — also triggers web
eslint.config.js        ← shared — also triggers web
.github/workflows/sdk-ci.yml
```

> **Shared-config fan-out** — changes to `tsconfig*.json` or `eslint.config.js`
> trigger **both** `ci/web` and `ci/sdk` because these files are consumed by the
> root vite build and both SDK packages.

### Contracts (`ci/contracts`)

```
contracts/**            (covers both solidity_contract/ and starknet_contract/)
.github/workflows/contracts-ci.yml
```

---

## Required check names (branch protection)

Add exactly one required status check to the `master` branch-protection rule:

```
ci/required-checks
```

This check always appears on every PR (it runs unconditionally), so the
protection rule never blocks a PR for a missing check.

---

## What each job does

### Web

| Step | Command | Fails PR? |
|---|---|---|
| Lint | `npm run lint` | ✅ Yes |
| Type-check | `npm run type-check` | ✅ Yes |
| Build | `npm run build` (vite) | ✅ Yes |
| Artifact | `vite-build-<sha>` (7 days) | — |

### Backend

| Step | Command | Fails PR? |
|---|---|---|
| Lint | `npm run lint` | ✅ Yes |
| Security audit | `npm audit --audit-level=high` | ✅ Yes (high/critical) |
| Tests | `npm test` (jest) | ✅ Yes |
| Artifact | `jest-results-<sha>` (14 days) | — |
| Services | postgres:14, redis:6 | — |

### SDK (matrix: `sdk`, `stellar-sdk`)

| Step | Command | Fails PR? |
|---|---|---|
| Lint | `npm run lint` | ✅ Yes |
| Type-check | `npm run typecheck` | ✅ Yes |
| Build | `npm run build` (tsup) | ✅ Yes |
| Artifact | `sdk-dist-<package>-<sha>` (7 days) | — |

### Contracts — Solidity

| Step | Tool | Fails PR? |
|---|---|---|
| Lint | `solhint 'src/**/*.sol'` | ✅ Yes |
| Build | `forge build --sizes` | ✅ Yes |
| Tests | `forge test -vvv` | ✅ Yes |
| Gas snapshot | `forge snapshot` | ⚠️ Advisory |
| **Security** | `slither --fail-high` | ✅ Yes (HIGH+CRITICAL) |
| Artifact | `slither-report-<sha>`, `forge-gas-report-<sha>` (14 days) | — |

### Contracts — StarkNet

| Step | Tool | Fails PR? |
|---|---|---|
| Build | `scarb build` | ✅ Yes |
| Tests | `snforge test` | ✅ Yes |

---

## Tool versions

| Tool | Pinned version |
|---|---|
| Node.js | 22 |
| Postgres service | 14 |
| Redis service | 6 |
| Solhint | 5 (latest v5) |
| Foundry | nightly |
| Slither | 0.10.4 |
| Scarb | 2.11.4 |
| Starknet Foundry | 0.43.1 |

---

## Running checks locally

### Web

```bash
# From repo root
npm ci
npm run lint
npm run type-check
npm run build
```

### Backend

```bash
cd backend
npm ci
npm run lint
npm audit --audit-level=high
npm test
```

### SDK

```bash
# @tagged/sdk
cd packages/sdk && npm ci && npm run lint && npm run typecheck && npm run build

# @tagged/stellar-sdk
cd packages/stellar-sdk && npm ci && npm run lint && npm run typecheck && npm run build
```

### Contracts — Solidity

```bash
cd contracts/solidity_contract

# Lint
npm install -g solhint@5
solhint 'src/**/*.sol'

# Build + test
forge build --sizes
forge test -vvv

# Security
pip install slither-analyzer==0.10.4
slither . --exclude-dependencies --filter-paths "lib/" --fail-high
```

### Contracts — StarkNet

```bash
cd contracts/starknet_contract
scarb build
snforge test
```

---

## Workflow files

| File | Description |
|---|---|
| `.github/workflows/web-ci.yml` | Web lint · typecheck · build |
| `.github/workflows/backend-ci.yml` | Backend lint · audit · test |
| `.github/workflows/sdk-ci.yml` | SDK lint · typecheck · build (matrix) |
| `.github/workflows/contracts-ci.yml` | Contracts solhint · forge · slither · snforge |
| `.github/workflows/required-checks.yml` | Gate — runs all checks, exposes `ci/required-checks` |
| `.github/workflows/flutter-ci.yml` | Mobile (Flutter) — separate check, not part of the gate |
| `.github/workflows/docker-build.yml` | Docker image push on merge to master |

---

## Adding a new component

1. Create a new workflow file, e.g. `.github/workflows/myservice-ci.yml`.
2. Add a path-filter job using `dorny/paths-filter@v3`.
3. Add your jobs gated on the filter output.
4. In `required-checks.yml`, add the new jobs to the `needs` list of
   `ci-required-checks` and add a corresponding `check` call in the evaluation
   step.
5. Document the new component in this file and in `CONTRIBUTING.md`.

---

## Artifacts

All artifacts are scoped to a specific commit SHA (`-<sha>`) to avoid
collisions across concurrent runs. They are **not** published — download them
from the GitHub Actions run summary page.

| Artifact name pattern | Content | Retention |
|---|---|---|
| `vite-build-<sha>` | Production bundle (`dist/`) | 7 days |
| `jest-results-<sha>` | Jest JSON results | 14 days |
| `sdk-dist-<pkg>-<sha>` | tsup dist output | 7 days |
| `forge-gas-report-<sha>` | Forge gas snapshot | 14 days |
| `slither-report-<sha>` | Slither JSON + SARIF | 14 days |
