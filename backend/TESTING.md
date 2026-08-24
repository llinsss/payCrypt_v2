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

### Unit Tests (No Database Required)
Unit tests run in isolation with mocked database layer. No PostgreSQL or Redis required.

```bash
cd backend
npm run test:unit    # Run unit tests only (fast, no DB needed)
```

**When to use:** Local development, quick validation, CI lint/unit phase.

**Test Files:** Any `*.test.js` file excluding `*.integration.test.js`.

### Integration Tests (PostgreSQL Required)
Integration tests require a live PostgreSQL connection to validate database interactions.

```bash
cd backend

# Start PostgreSQL (if not already running)
docker-compose up -d postgres

# Set up environment
export DATABASE_URL="postgres://taggedpay_user:taggedpay_password@localhost:5432/paycrypt_test"

# Run integration tests
npm run test:integration
```

**When to use:** Pre-commit validation, before merge, CI merge-gate phase.

**Test Files:** Files matching `*.integration.test.js`.

**Prerequisites:**
- PostgreSQL running and accessible at DATABASE_URL
- See setup.integration.js for required environment validation

### All Tests (Legacy)
```bash
cd backend
npm test              # Runs current test script (see #492 for migration)
npm run test:all     # Runs all tests in tests/ directory
```

### Database Utilities
```bash
npm run test:db           # Verify database connectivity
npm run test:migrations   # Test migration up/down in isolation
```

## Nested Project Suites
Each nested project maintains its own test execution:

```bash
cd backend/Real-Time\ Stellar\ Horizon/backend
npm test    # Runs stellar-horizon-backend tests

cd backend/Multi-Chain\ Transaction/backend
npm test    # Runs multi-chain-transaction-backend tests
```

## CI Execution
CI runs test suites independently and reports results separately via `.github/workflows/backend-tests.yml`:

1. **Unit Tests** (always): `npm run test:unit`
   - No database required
   - Runs on all PRs
   - Must pass to merge

2. **Integration Tests** (when DB available): `npm run test:integration`
   - PostgreSQL required
   - Runs with services (postgres, redis)
   - May be skipped if DATABASE_URL unavailable

3. **Nested Projects** (optional): Separate CI job
   - Stellar Horizon backend tests (if dependencies available)
   - Multi-Chain Transaction backend tests (if dependencies available)
   - Failures do not block main PR (separate projects)

See `.github/workflows/backend-tests.yml` for workflow configuration and `.github/workflows/README.md` for detailed setup.

## Test Baseline and Failure Classification

See `backend/docs/TEST_BASELINE.md` for:
- Green baseline expectations (passing counts, failure classifications)
- Detailed failure remediation status
- Quarantine process for unavoidable failures
- How failures are tracked and scheduled for removal
