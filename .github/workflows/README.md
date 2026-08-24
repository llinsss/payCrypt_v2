# GitHub Actions Workflows

This directory contains CI/CD automation for the payCrypt project.

## Backend Tests Workflow

**File:** `backend-tests.yml`

### Purpose

Runs backend test suites with separate reporting for unit and integration tests.

### Trigger

- Push to `main`, `develop`, or `fix/**` branches (only if `backend/**` or workflow changed)
- Pull requests to `main` or `develop` (only if `backend/**` changed)

### Jobs

#### Unit Tests

- **Runs on:** Ubuntu latest
- **Node versions:** 18.x, 20.x (matrix)
- **Services:** None required
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Run `npm run test:unit`
  5. Upload test results as artifact

**Status:** Must pass to merge PR

#### Integration Tests

- **Runs on:** Ubuntu latest
- **Node versions:** 18.x
- **Services:** PostgreSQL 14, Redis 7
- **Database:** `paycrypt_test`
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Wait for PostgreSQL
  5. Run migrations (`npm run migrate`)
  6. Run `npm run test:integration`
  7. Upload test results as artifact

**Status:** Should pass if available; may be skipped if DATABASE_URL unavailable

#### Nested Projects (Stellar, Multi-Chain)

- **Runs on:** Ubuntu latest
- **Node versions:** 18.x
- **Purpose:** Run independent tests for nested projects
- **Failures:** Do not block PR (separate projects)
- **Continue on error:** Yes (independent projects, optional)

**Status:** Informational only; does not block merge

#### Test Summary

- **Runs:** After unit and integration tests complete
- **Purpose:** Publish consolidated test results to PR
- **Output:** GitHub step summary with test counts and artifact links

### Test Result Artifacts

Test results are published as CI artifacts for 30 days:

- `unit-test-results-18.x` — JUnit XML from unit test run
- `unit-test-results-20.x` — JUnit XML from unit test run
- `integration-test-results-18.x` — JUnit XML from integration test run

### Environment Variables

**Available during CI:**
- `NODE_ENV` — Not set (uses default)
- `DATABASE_URL` — Set for integration tests (postgres://taggedpay_user:taggedpay_password@localhost:5432/paycrypt_test)
- `DB_*` — Database connection variables (HOST, PORT, NAME, USER, PASSWORD)
- `REDIS_URL` — Set for integration tests (redis://localhost:6379)

## Local Reproduction

To reproduce the CI workflow locally:

### Unit Tests (No Services)

```bash
cd backend
npm install  # If not done recently
npm run test:unit
```

### Integration Tests (Requires PostgreSQL + Redis)

#### Option 1: Docker Compose (Easiest)

```bash
# From repo root
docker-compose up -d postgres redis

# From backend directory
export DATABASE_URL="postgres://taggedpay_user:taggedpay_password@localhost:5432/paycrypt_test"
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=paycrypt_test
export DB_USER=taggedpay_user
export DB_PASSWORD=taggedpay_password
export REDIS_URL="redis://localhost:6379"

npm run migrate
npm run test:integration
```

#### Option 2: Local PostgreSQL + Redis

```bash
# Ensure PostgreSQL and Redis are running locally
# Create test database
createdb -U postgres paycrypt_test

export DATABASE_URL="postgres://postgres:password@localhost:5432/paycrypt_test"
export REDIS_URL="redis://localhost:6379"

cd backend
npm run migrate
npm run test:integration
```

## Troubleshooting

### Unit Tests Fail

1. Check Node.js version: `node --version` (should be ≥18.0.0)
2. Clear cache: `rm -rf node_modules package-lock.json && npm install`
3. Check setup.unit.js loads correctly (database mocking)
4. Run single test file: `npm test -- path/to/test.js`

### Integration Tests Fail

1. Check PostgreSQL is running: `pg_isready -h localhost`
2. Check DATABASE_URL is set: `echo $DATABASE_URL`
3. Check Redis is running: `redis-cli ping`
4. Check migrations ran: `npm run migrate:status`
5. Check connection: `npm run test:db`

### Test Artifacts Not Generated

1. Check jest-junit is installed: `npm ls jest-junit`
2. Check test-results directory was created: `ls -la backend/test-results/`
3. Verify jest config has reporters configured: `grep -A5 reporters backend/jest.config.*.js`

## Adding New Tests

When adding new tests:

1. **Unit tests:** Create `*.test.js` in `backend/tests/`
2. **Integration tests:** Create `*.integration.test.js` in `backend/tests/`
3. **Quarantine if needed:** Use `test.skip()` with comment including issue #, reason, expiry date
4. **Run locally:** `npm run test:unit` or `npm run test:integration`
5. **Commit:** Include test files and update docs as needed

## Failure Quarantine Process

If a test must be skipped due to blockers:

```javascript
// TODO: #999 - [Reason for failure]. Expected resolution by 2026-09-30.
// Contact @owner for updates or force-fix before expiry.
test.skip("should [description]", async () => {
  // test code
});
```

**Before expiry date:**
1. Check if issue #999 is resolved
2. If yes: Remove skip, re-enable test, verify it passes locally
3. If no: Update expiry date and notify owner
4. Commit with message: `test: [fix #999 | extend quarantine #999]`

**Never silently extend quarantine without updating dates.**

## References

- Test configuration: `backend/jest.config.unit.js`, `backend/jest.config.integration.js`
- Test setup: `backend/tests/setup.unit.js`, `backend/tests/setup.integration.js`
- Test documentation: `backend/TESTING.md`, `backend/docs/TEST_BASELINE.md`
- Contributing guide: `CONTRIBUTING.md`
