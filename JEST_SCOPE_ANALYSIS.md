# Jest Test Scope Analysis

## Issue #491: Restrict Jest Discovery to Supported Backend Tests

### Current State
Jest is currently configured in `backend/package.json` with `testPathIgnorePatterns` attempting to exclude nested projects, but Jest discovery still scans the entire backend directory hierarchy.

### Nested Projects with Independent Dependencies

#### Real-Time Stellar Horizon
- **Path:** `backend/Real-Time Stellar Horizon/backend/`
- **Package:** stellar-horizon-backend v1.0.0
- **Key Dependencies:** mongoose, @stellar/stellar-sdk, bullmq, ioredis, socket.io
- **Notable Absence:** mongoose is NOT in main backend dependencies — causes import failures if discovered
- **Own Test Config:** Yes — jest config in nested package.json
- **Test Pattern:** `**/tests/**/*.test.js`

#### Multi-Chain Transaction
- **Path:** `backend/Multi-Chain Transaction/backend/`
- **Package:** multi-chain-transaction-backend v1.0.0
- **Key Dependencies:** prom-client (Prometheus), ethers, starknet, @onflow/fcl
- **Notable Absence:** prom-client is NOT in main backend dependencies — causes import failures if discovered
- **Own Test Config:** Minimal — inherits root jest defaults
- **Test Pattern:** `tests/`

### Main Backend
- **Path:** `backend/`
- **Package:** tagged-backend v1.0.0
- **Test Location:** `backend/tests/` (verified test files present)
- **Test Count:** Approximately 189 passing, 22 failing suites, 36 failing tests (before this fix)
- **Dependencies:** pg, knex, redis, bullmq, ethers, starknet, etc. (does NOT include mongoose, prom-client)

### Failure Classification
- **Out-of-Scope Failures** (from nested projects):
  - Mongoose import failures (Stellar project tests discovered but dependencies not installed)
  - prom-client import failures (Multi-Chain project tests discovered but dependencies not installed)
  - These inflate the reported failure count in #490

- **In-Scope Failures** (remaining):
  - Unit tests with Knex instantiation without configured client
  - Integration tests expecting PostgreSQL connectivity
  - Crypto amount precision validation failures
  - See #492 and #493 for remediation

### Recommendation
Use Jest `roots` configuration to restrict discovery to the main backend test suite only, allowing nested projects to maintain independent test execution:
```json
"roots": ["<rootDir>/tests"]
```

Alternative: Use `testPathPattern` to explicitly include only main backend tests.
