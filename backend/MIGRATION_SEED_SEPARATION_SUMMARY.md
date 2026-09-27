# Migration & Seed Separation Implementation Summary

## Overview

Issue #575 has been successfully implemented. Schema migrations are now fully separated from seed execution, preventing demo/reference data from contaminating production deployments.

---

## What Changed

### 1. Package.json Scripts (Breaking Change)

**Before:**
```json
"migrate": "knex migrate:latest && knex seed:run"
```

**After:**
```json
"migrate": "knex migrate:latest",
"seed": "knex seed:run",
"seed:prod": "node scripts/seed-production.js",
"seed:demo": "knex seed:run",
"migrate:dev": "npm run migrate && npm run seed:demo"
```

**Migration Guide for Users:**
- If you were using `npm run migrate` for local dev, switch to `npm run migrate:dev`
- In production, use `npm run migrate` (migrations only) followed by `npm run seed:prod`

### 2. Seed File Organization

Seeds are now clearly categorized by naming and content:

**Production-Safe Seeds** (always safe to run):
- `01_production_tokens_seed.js` - Blockchain token definitions
- `02_production_chains_seed.js` - Blockchain network configurations

**Demo-Only Seeds** (never run in production):
- `03_demo_stellar_example_data.js` - Example Stellar accounts
- `04_demo_users_wallets.js` - Demo user accounts with hardcoded password
- `05_demo_transactions.js` - Sample transaction and payment history

Each seed file has a clear header comment indicating production status.

### 3. New Docker Support

**Updated Dockerfile** with entrypoint script supporting:
- `MIGRATE_ON_START=prod` - Run migrations at container startup
- `SEED_ON_START=prod` - Load production-safe seeds
- `SEED_ON_START=demo` - Load all seeds (development only)

```bash
# Production deployment
docker run \
  -e MIGRATE_ON_START=prod \
  -e SEED_ON_START=prod \
  paycrypt-backend:latest

# Development deployment
docker run \
  -e MIGRATE_ON_START=true \
  -e SEED_ON_START=demo \
  paycrypt-backend:latest
```

### 4. Regression Testing

New test suite ensures demo data never reaches production:

- `backend/tests/production-seed-regression.test.js` - Comprehensive test suite
- `backend/scripts/verify-no-demo-data.js` - CLI verification tool
- GitHub Actions workflow (`backend-tests.yml`) runs tests on every commit

Tests verify:
- ✅ No demo users exist after production seeding
- ✅ No demo transactions exist
- ✅ No demo Stellar data exists
- ✅ Production data (tokens, chains) is loaded correctly
- ✅ Detection queries work properly

### 5. CI/CD Updates

**GitHub Actions:**
- `backend-ci.yml` - Existing test suite (no migrations/seeds)
- `backend-tests.yml` - New extended tests including production seed regression
- `docker-build.yml` - No changes (images don't include seed data)

**Docker Build Strategy:**
- Docker image contains schema + application only
- No seed data in the image
- Seeding happens at deployment time via environment variables

---

## Documentation Added

### 1. **backend/docs/SEED_CATEGORIZATION.md** (Critical)
Complete reference for which seeds are production-safe and which are demo-only.
- Production-safe vs demo-only seeds
- Usage guide for each environment
- Verification queries to detect demo data
- Migration path for cleaning existing demo data

### 2. **backend/DOCKER_DEPLOYMENT.md**
Docker deployment guide with:
- Build instructions
- Docker run examples for production, staging, development
- Kubernetes deployment example
- Docker Compose example
- Best practices and troubleshooting

### 3. **backend/SCRIPTS_AND_COMMANDS.md**
Complete reference for all npm scripts:
- Quick reference table
- Development commands
- Production commands
- Testing commands
- Workflow examples
- Troubleshooting

### 4. **backend/PRODUCTION_DEPLOYMENT_CHECKLIST.md**
Critical pre/during/post-deployment checklist:
- Pre-deployment verification
- Staging deployment steps
- Production deployment steps
- Post-deployment verification queries
- Rollback procedure
- Emergency contacts

### 5. **Updated Existing Docs**
- `docs/setup_guide.md` - Updated with new scripts
- `backend/docs/ROLLBACK_GUIDE.md` - Added seeding section

---

## Implementation Details

### File Changes Summary

| File | Type | Change |
|------|------|--------|
| `backend/package.json` | Modified | Scripts: migrate schema-only, added seed:prod, migrate:dev |
| `backend/Dockerfile` | Modified | Added entrypoint script, supports MIGRATE_ON_START, SEED_ON_START |
| `backend/docker-entrypoint.sh` | New | Flexible startup: optional migrations and seeding |
| `backend/scripts/seed-production.js` | New | Runs only production-safe seeds |
| `backend/scripts/verify-no-demo-data.js` | New | Verifies no demo data in database |
| `backend/seeds/01_production_tokens_seed.js` | New | Production tokens (renamed, with header) |
| `backend/seeds/02_production_chains_seed.js` | New | Production chains (renamed, with header) |
| `backend/seeds/03_demo_stellar_example_data.js` | New | Demo Stellar data (renamed, with header) |
| `backend/seeds/04_demo_users_wallets.js` | New | Demo users (renamed, with header) |
| `backend/seeds/05_demo_transactions.js` | New | Demo transactions (renamed, with header) |
| `backend/tests/production-seed-regression.test.js` | New | Regression test suite |
| `.github/workflows/backend-ci.yml` | Modified | Added migration/seed documentation |
| `.github/workflows/docker-build.yml` | Modified | Added deployment strategy documentation |
| `.github/workflows/backend-tests.yml` | New | Extended tests including prod seed regression |
| `backend/.env.example` | Modified | Added migration/seed strategy and Docker variables |
| `backend/DOCKER_DEPLOYMENT.md` | New | Complete Docker deployment guide |
| `backend/SCRIPTS_AND_COMMANDS.md` | New | Scripts and commands reference |
| `backend/PRODUCTION_DEPLOYMENT_CHECKLIST.md` | New | Production deployment checklist |
| `docs/setup_guide.md` | Modified | Updated with new script names |
| `backend/docs/ROLLBACK_GUIDE.md` | Modified | Added post-rollback seeding guidance |

---

## Migration Path for Existing Users

### For Local Development

**Old way:**
```bash
npm run migrate  # Migrations + seeds together
```

**New way:**
```bash
npm run migrate:dev  # Convenience script (migrations + all seeds)
# Or manually:
npm run migrate     # Migrations only
npm run seed:demo   # All seeds including demo
```

### For Production Deployments

**Old way (DANGEROUS):**
```bash
npm run migrate  # Would seed demo data!
```

**New way (SAFE):**
```bash
npm run migrate       # Schema only (safe)
npm run seed:prod     # Production-safe seeds only
npm run verify:no-demo # Verify no demo data
```

### For Docker Deployments

**Old way:**
- No option to separate migrations from seeds in Dockerfile

**New way:**
```bash
# With environment variables
docker run \
  -e MIGRATE_ON_START=prod \
  -e SEED_ON_START=prod \
  paycrypt-backend:latest
```

---

## Safety Improvements

### What's Prevented Now

1. ✅ **Demo data in production** - `npm run migrate` no longer seeds demo data
2. ✅ **Accidental demo user creation** - Production scripts explicitly exclude demo seeds
3. ✅ **Reference data leaks** - Verification tests ensure zero demo data in production
4. ✅ **Schema issues** - Migrations are decoupled from seeding concerns
5. ✅ **Deployment complexity** - Clear, separate commands for each environment

### Regression Tests

The test suite verifies that after production seeding:
- 🔍 No demo users with `@demo.tagged.local` email
- 🔍 No demo users with `@demo_` tag prefix
- 🔍 No demo transactions with `demo-tx-` reference
- 🔍 No demo transactions with `0xdemo` hash
- 🔍 No demo scheduled payments with `demo-schedule-` memo
- 🔍 No demo Stellar tags or accounts
- 🔍 Production data (tokens, chains) IS present

Runs on every commit and deployment.

---

## Verification Commands

### Verify Implementation

```bash
# 1. Check new scripts exist
npm run --list | grep -E "migrate|seed"

# 2. Run migration test
npm run test:migrations

# 3. Run production seed regression test
npm run test:prod-seeds

# 4. Verify no demo data
npm run verify:no-demo
```

### Verify Production Database

```sql
-- After production deployment, run these queries
-- All should return 0 (except token/chain counts which should be > 0)

SELECT COUNT(*) FROM users 
WHERE email LIKE '%@demo.tagged.local%' OR tag LIKE '@demo_%';

SELECT COUNT(*) FROM transactions 
WHERE reference LIKE 'demo-tx-%' OR tx_hash LIKE '0xdemo%';

SELECT COUNT(*) FROM stellar_tags 
WHERE tag IN ('@stellar_demo', '@test_account');

SELECT COUNT(*) FROM tokens;    -- Should be >= 6
SELECT COUNT(*) FROM chains;    -- Should be >= 6
```

---

## Breaking Changes

1. **`npm run migrate`** - No longer runs seeds (was: `knex migrate:latest && knex seed:run`)
   - **Impact**: Local dev users need to use `npm run migrate:dev` instead
   - **Benefit**: Production safety (can't accidentally seed demo data)

2. **Seed file names** - Files have been renamed and reorganized
   - **Impact**: Custom scripts referencing old names need updates
   - **Benefit**: Clear production-safe vs demo distinction

3. **Docker behavior** - Dockerfile requires explicit `MIGRATE_ON_START` to run migrations
   - **Impact**: Existing Docker deployments need to add env var
   - **Benefit**: Prevents automatic seeding without intent

---

## Future Enhancements

Potential improvements for future phases:

1. Database versioning strategy (track which seed batches were applied)
2. Seed rollback capability (currently seeds are cumulative)
3. Environment-specific seed filtering (auto-select prod vs demo)
4. Seed audit logging (track when seeds were applied and by whom)
5. Seed data validation (ensure production seeds meet quality gates)

---

## Questions & Support

### Common Questions

**Q: I deployed to production and now I'm seeing demo users. What do I do?**
A: See [PRODUCTION_DEPLOYMENT_CHECKLIST.md](./PRODUCTION_DEPLOYMENT_CHECKLIST.md) - Rollback section.

**Q: Why does the Dockerfile need MIGRATE_ON_START?**
A: For explicit control. You might want just the app, or just to seed, or both. Now you can choose.

**Q: Can I use `npm run migrate` locally without worrying about demo data?**
A: Yes! Demo data only loads with `npm run seed:demo` or `npm run seed` (which runs all seeds).

**Q: What if I have a custom seed that's production-safe?**
A: Name it with `production_` prefix and add the header comment. See [SEED_CATEGORIZATION.md](./docs/SEED_CATEGORIZATION.md).

### Support Resources

- [Seed Categorization](./docs/SEED_CATEGORIZATION.md) - Which seeds are safe where
- [Docker Deployment](./DOCKER_DEPLOYMENT.md) - Docker-specific guidance
- [Production Deployment Checklist](./PRODUCTION_DEPLOYMENT_CHECKLIST.md) - Pre-deployment verification
- [Scripts & Commands](./SCRIPTS_AND_COMMANDS.md) - All available commands
- [Rollback Guide](./docs/ROLLBACK_GUIDE.md) - Recovery procedures

---

## Acceptance Criteria ✅

All acceptance criteria from issue #575 have been met:

- ✅ **Make migrate schema-only** - `npm run migrate` no longer runs seeds
- ✅ **Provide explicit seed command** - `npm run seed:prod` and `npm run seed:demo`
- ✅ **Update deployment docs** - [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) with examples
- ✅ **Update CI** - [backend-tests.yml](.github/workflows/backend-tests.yml) verifies no demo data in production
- ✅ **Test production scripts** - Regression tests ensure demo data never loads
- ✅ **Update documentation** - Multiple docs created/updated
- ✅ **Focused regression coverage** - [production-seed-regression.test.js](./tests/production-seed-regression.test.js)

---

## Deployment Instructions

### For First-Time Deployers

See [PRODUCTION_DEPLOYMENT_CHECKLIST.md](./PRODUCTION_DEPLOYMENT_CHECKLIST.md) - complete step-by-step guide.

### Quick Version

```bash
# 1. Backup production database
pg_dump -U $DB_USER -h $DB_HOST $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Pull latest code
git pull origin master
npm ci --omit=dev

# 3. Run migrations (schema-only)
npm run migrate

# 4. Seed production data
npm run seed:prod

# 5. Verify no demo data
npm run verify:no-demo  # Should print: ✓ No demo data detected

# 6. Restart application
systemctl restart paycrypt-backend
```

---

## Version

- **Issue**: #575
- **Implementation Date**: August 29, 2026
- **Status**: ✅ Complete
- **Documentation**: Complete
- **Tests**: Complete
- **CI/CD**: Updated
