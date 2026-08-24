# Backend Test Architecture

## Test Discovery and Scoping

Jest is configured to discover tests only within `backend/tests/` to ensure test isolation from nested projects that maintain independent dependencies and test suites.

### Main Backend Tests
- **Location:** `backend/tests/`
- **Command:** `npm test` (from `backend/`)
- **Purpose:** Unit and integration tests for core API, services, controllers
- **Dependencies:** Installed in `backend/package.json`

### Real-Time Stellar Horizon
- **Location:** `backend/Real-Time Stellar Horizon/backend/`
- **Command:** `npm test` (from `backend/Real-Time Stellar Horizon/backend/`)
- **Purpose:** Stellar-specific transaction monitoring and streaming
- **Key Dependencies:** mongoose, @stellar/stellar-sdk, bullmq, ioredis
- **Note:** Maintains independent dependency set; not installed in main backend

### Multi-Chain Transaction
- **Location:** `backend/Multi-Chain Transaction/backend/`
- **Command:** `npm test` (from `backend/Multi-Chain Transaction/backend/`)
- **Purpose:** Multi-chain worker processes for EVM, Starknet, Flow
- **Key Dependencies:** ethers, starknet, @onflow/fcl, prom-client
- **Note:** Maintains independent dependency set; not installed in main backend

## Running Tests

### Main Backend Suite
```bash
cd backend
npm test              # Run main backend tests
npm run test:db      # Database setup verification
npm run test:all     # Run all main backend tests (not recommended — see #491)
```

### Nested Project Suites
Each nested project maintains its own test execution:
```bash
cd backend/Real-Time\ Stellar\ Horizon/backend
npm test

cd backend/Multi-Chain\ Transaction/backend
npm test
```

## CI Execution
CI should run each test suite independently and report results separately to clearly identify which suite has failures:
1. Main backend suite
2. Stellar Horizon suite (optional, skipped if dependencies unavailable)
3. Multi-Chain Transaction suite (optional, skipped if dependencies unavailable)

See `.github/workflows/` for CI automation and reporting configuration.
