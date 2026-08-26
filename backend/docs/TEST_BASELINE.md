# Backend Test Baseline and Failure Classification

## Green Baseline

After applying fixes from #491, #492, and #493, the backend test suite should report:
- **Passing Tests:** 189+ (unit tests with proper mocking)
- **Failing Tests:** 0 (all failures classified, fixed, or quarantined with owner + expiry)
- **Test Suites:** Scoped to `backend/tests/` only (nested projects excluded)

## Failure Classification

All test failures have been classified into one of four categories:

### Category 1: Fixed in This Batch

Failures resolved by fixes in #491, #492, or #493:

#### Fixed by #491 (Jest Discovery Scoping)

| Suite | Reason | Status |
|-------|--------|--------|
| Real-Time Stellar Horizon tests | Mongoose not in main backend deps | ✅ Excluded from main discovery |
| Multi-Chain Transaction tests | prom-client not in main backend deps | ✅ Excluded from main discovery |

**Impact:** Removes ~12-15 false-positive failures from main backend test count.

#### Fixed by #492 (Unit/Integration Separation)

| Suite | Reason | Status |
|-------|--------|--------|
| Services with Knex instantiation | DB not configured for unit tests | ✅ Mocked in unit setup |
| Import-time Knex failures | Uninitialized database client | ✅ Unit tests mock before import |

**Impact:** Resolves import-time crashes that prevented test discovery.

#### Fixed by #493 (Crypto Amount Precision)

| Suite | Reason | Status |
|-------|--------|--------|
| Payment validation tests | Joi rejected 1e18 values as unsafe | ✅ Now accepts decimal strings |
| Amount precision tests | Floating-point precision loss | ✅ Validated with BigNumber |
| Batch payment validation | Numeric amounts rejected | ✅ String format enforced |

**Impact:** Resolves ~3-5 validation-related test failures.

### Category 2: Product Defects (To Be Fixed or Quarantined)

Failures representing actual bugs in production code that need fixing:

| Suite | Issue | Recommended Action | Owner | Expiry |
|-------|-------|-------------------|-------|--------|
| [List actual failures if any remain after #491-#493 fixes] | | | | |

**Guidance:**
- If fixable in scope: Fix immediately, create commit with details
- If out of scope: Quarantine with `@skip` + comment referencing issue number and removal date
- If blocking: File new GitHub issue and reference in quarantine annotation

Example quarantine:

```javascript
// TODO: #999 - Failing because [reason]. Expected fix by 2026-09-30.
// Remove this skip and fix the issue before the expiry date.
test.skip("should [description]", async () => {
  // test code
});
```

### Category 3: Test Defects (Stale Mocks, Incorrect Assertions)

Failures due to test code issues, not production bugs:

| Suite | Issue | Fix | Status |
|-------|-------|-----|--------|
| [List stale mock failures, if any] | | Update mock to match current implementation | | |

**Guidance:**
- Update mocks to reflect current production behavior
- Fix incorrect assertions
- Commit alongside the test suite as "test: fix stale mocks for X suite"

### Category 4: Integration Prerequisites (Skip with Clear Error)

Failures due to missing configuration or external services:

| Prerequisite | Check | Skip Condition | Error Message |
|--------------|-------|---|---|
| **PostgreSQL** | `DATABASE_URL` set | Integration tests only | See setup.integration.js |
| **Redis** | `REDIS_URL` set | If Redis-dependent test | Clear setup instruction |

**Guidance:**
- Skip gracefully with clear error message (not bare `test.skip()`)
- Direct developer to documentation (CONTRIBUTING.md, TESTING.md)
- Integration test setup file validates and exits with actionable error

Example (in setup.integration.js):

```javascript
if (!process.env.DATABASE_URL) {
  throw new Error(
    'Integration tests require DATABASE_URL. ' +
    'See CONTRIBUTING.md step "Set up database" for instructions.'
  );
}
```

## Test Suite Structure After Fixes

### Unit Test Suite (`npm run test:unit`)

**Configuration:** `jest.config.unit.js`
**Setup:** `tests/setup.unit.js` (mocks database)
**Pattern:** `*.test.js` (excludes `*.integration.test.js`)

**Expected Results:**
- All unit tests pass or are properly quarantined
- No database required
- Completes in <30 seconds on typical dev machine

**Run:**
```bash
cd backend
npm run test:unit
```

### Integration Test Suite (`npm run test:integration`)

**Configuration:** `jest.config.integration.js`
**Setup:** `tests/setup.integration.js` (validates DATABASE_URL)
**Pattern:** `*.integration.test.js` only

**Expected Results:**
- All integration tests pass or are properly quarantined
- PostgreSQL required and must be running
- Clear error if DATABASE_URL missing
- Completes in <60 seconds

**Run:**
```bash
cd backend
export DATABASE_URL="postgres://taggedpay_user:taggedpay_password@localhost:5432/paycrypt_test"
npm run test:integration
```

### Full Test Suite (`npm test`)

**Status:** Legacy command during transition
**Recommended:** Use `test:unit` and `test:integration` separately

## CI Reporting

### GitHub Actions Workflow

Separate steps for unit and integration test reporting:

```yaml
- name: Run Unit Tests
  run: cd backend && npm run test:unit
  if: always()  # Run even if previous step failed

- name: Run Integration Tests
  run: |
    cd backend
    export DATABASE_URL="postgres://..."
    npm run test:integration
  if: always()  # Run even if previous step failed
  continue-on-error: true  # Don't fail PR if DB unavailable

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: test-results
    path: backend/test-results/**/*.json
```

### Test Result Publishing

Each test run publishes separate reports:

1. **Unit Tests** — Always required to pass
   - Artifact: `test-results/unit/results.json`
   - Step logs show: `[Unit Tests] 189 passing`

2. **Integration Tests** — May be skipped if DB unavailable
   - Artifact: `test-results/integration/results.json`
   - Step logs show: `[Integration Tests] 5 passing` or `[Integration Tests] skipped (DATABASE_URL not set)`

3. **Quarantined Tests** — Visible in logs with owner + expiry
   - Example log: `[QUARANTINE] authService.test.js:42 - #999 - Expiry: 2026-09-30 - Owner: @aji70`

## Documented Local Environment

### Requirements

- **Node.js:** >=18.0.0
- **npm:** >=9.0.0
- **Docker:** (for PostgreSQL if not installed locally)

### Quick Start

```bash
# Clone and setup
git clone https://github.com/Tukura11/payCrypt_v2.git
cd payCrypt_v2/backend
npm install

# Run unit tests (no DB needed)
npm run test:unit

# Setup and run integration tests (DB required)
docker-compose up -d postgres  # From repo root
export DATABASE_URL="postgres://taggedpay_user:taggedpay_password@localhost:5432/paycrypt_test"
npm run test:integration

# Run all tests
npm run test:unit && npm run test:integration
```

### Docker Compose Setup

From repo root:

```bash
cp backend/.env.example backend/.env
docker-compose up -d postgres redis
cd backend
npm run migrate
npm run test:integration
```

## Success Criteria

✅ **Test Suite is Green When:**

1. **Unit Tests:** `npm run test:unit` exits with code 0
2. **Integration Tests:** `npm run test:integration` exits with code 0 (when DB available)
3. **No Bare Skips:** Every `test.skip()` has a comment with:
   - GitHub issue number
   - Removal/expiry date (within 30 days of commit)
   - Reason and fix guidance
4. **CI Reports:** Test results published separately for unit and integration
5. **Documentation:** CONTRIBUTING.md and TESTING.md updated with test commands

## Removal Process for Quarantined Tests

When expiry date arrives:

1. **Check Status:** Is the referenced issue resolved?
2. **If Yes:** Remove `test.skip()` and `.only` to re-enable test
3. **If No:** Update expiry date and notify owner
4. **Commit:** Include issue number in commit message, e.g., `test: remove #999 quarantine, re-enable authService suite`

Never silently extend quarantine dates — always update with explicit owner and new expiry.

## References

- Test runner configuration: `backend/jest.config.unit.js`, `backend/jest.config.integration.js`
- Setup files: `backend/tests/setup.unit.js`, `backend/tests/setup.integration.js`
- Test organization: `backend/TESTING.md`
- Contributing guide: `CONTRIBUTING.md`
- Amount precision: `backend/docs/AMOUNT_PRECISION.md`
