# Backend Scripts & Commands Reference

Complete reference for all npm scripts and database commands in the PayCrypt backend.

---

## Quick Reference

| Script | Purpose | Environment | Safe in Production |
|--------|---------|-------------|-------------------|
| `npm run dev` | Start dev server with hot reload | Development | ❌ No |
| `npm start` | Start production server | Production | ✅ Yes |
| `npm test` | Run test suite | Test | ✅ Yes |
| `npm run migrate` | Run schema migrations | Any | ✅ Yes |
| `npm run seed:prod` | Load production-safe seeds | Production/Staging | ✅ Yes |
| `npm run seed:demo` | Load all seeds + demo data | Development | ❌ No |
| `npm run migrate:dev` | Migrate + seed all (dev convenience) | Development | ❌ No |
| `npm run db:reset` | Full reset: rollback all, migrate, seed | Local Dev | ❌ No |

---

## Development Commands

### Server

```bash
# Start dev server with nodemon (auto-reload)
npm run dev

# Start production server
npm start

# Lint code
npm run lint

# Check for raw SQL (security audit)
npm run check:raw-sql
```

### Database Setup (Local)

```bash
# Initial setup: migrate + seed all
npm run migrate:dev

# Or manually:
npm run migrate        # Schema only
npm run seed:demo      # All seeds (production + demo)

# Full reset: rollback all, then setup fresh
npm run db:reset
```

---

## Production Commands

### Migrations (Schema Only)

**Migrations are always safe to run in production.**

```bash
# Run all pending migrations
npm run migrate

# Rollback last batch of migrations
npm run migrate:rollback

# Rollback ALL migrations (careful!)
npm run migrate:rollback:all

# Check migration status
npm run migrate:status

# Create new migration
npm run migrate:make <name>
# Example: npm run migrate:make create_users_table
```

### Seeding (Data)

**Use `seed:prod` for production; never use `seed:demo`.**

```bash
# Production-safe seeds only (tokens, chains)
npm run seed:prod

# All seeds including demo data (development only)
npm run seed:demo

# All seeds via Knex (same as seed:demo)
npm run seed

# Create new seed file
npm run seed:make <name>
# Example: npm run seed:make 01_initial_data
```

---

## Testing Commands

### Unit & Integration Tests

```bash
# Run standard test suite
npm test

# Run all tests (includes extended tests)
npm run test:all

# Run specific test file pattern
npm test -- --testPathPattern='auth.service'
```

### Database Tests

```bash
# Test database setup
npm run test:db

# Test migrations work correctly
npm run test:migrations

# Test production seeding (regression test)
npm run test:prod-seeds

# Verify no demo data in database
npm run verify:no-demo
```

### Utility Commands

```bash
# Generate migration documentation
npm run generate:migration-docs

# Load testing: connection pool
npm run load-test:pool

# Backup database
npm run backup:db
```

---

## Workflow Examples

### Local Development Setup

```bash
# 1. First time setup
cd backend
npm install

# 2. Create .env with local database
cp .env.example .env

# 3. Setup database with schema + demo data
npm run migrate:dev

# 4. Start dev server
npm run dev
```

### Production Deployment

```bash
# 1. Build Docker image
docker build -t paycrypt-backend:latest backend

# 2. Run migrations at startup
docker run \
  -e MIGRATE_ON_START=prod \
  -e SEED_ON_START=prod \
  -e NODE_ENV=production \
  -e DB_HOST=postgres \
  -e DB_NAME=paycrypt \
  -e DB_USER=paycrypt \
  -e DB_PASSWORD=<secret> \
  -e JWT_SECRET=<secret> \
  paycrypt-backend:latest
```

### Staging/QA Setup

```bash
# 1. Run migrations + all seeds
npm run migrate:dev

# Or separately:
npm run migrate
npm run seed:demo

# 2. Run with demo data and verify
npm run verify:no-demo  # Should show demo data present
```

### Database Recovery

```bash
# 1. Backup current database
npm run backup:db

# 2. Identify problem
npm run migrate:status

# 3. Rollback problematic batch
npm run migrate:rollback

# 4. Verify health
curl http://localhost:3000/api/health

# 5. If needed, re-apply migrations
npm run migrate

# 6. Re-seed production data
npm run seed:prod
```

---

## Migration Workflow

### Creating a New Migration

```bash
# 1. Generate migration file
npm run migrate:make add_user_roles

# 2. Edit the generated file: backend/migrations/TIMESTAMP_add_user_roles.js
# Implement up() and down() methods

# 3. Test locally
npm run migrate

# 4. Verify schema
npm run migrate:status

# 5. Test rollback
npm run migrate:rollback

# 6. Re-apply
npm run migrate

# 7. Commit and deploy
git add migrations/
git commit -m "feat: add user roles"
git push
```

### Testing Migrations in CI

```bash
# This runs in GitHub Actions
npm run test:migrations

# Checks that:
# - All migrations apply without error
# - Migrations can be rolled back
# - Database state is consistent
```

---

## Seeding Workflow

### Creating New Production-Safe Seed

```bash
# 1. Create seed file
npm run seed:make 01_production_new_data

# 2. Edit: backend/seeds/01_production_new_data.js
# ⚠️ Important: Only include non-demo data
# Add file header comment:
# /**
#  * Production-safe seed: <description>
#  * Contains NO demo/reference data. Safe to run in production.
#  */

# 3. Test locally
npm run seed:prod

# 4. Verify no demo data
npm run verify:no-demo

# 5. Commit
git add seeds/
git commit -m "feat: add production seed data"
```

### Creating Demo-Only Seed

```bash
# 1. Create seed file
npm run seed:make 03_demo_new_fixtures

# 2. Edit: backend/seeds/03_demo_new_fixtures.js
# ⚠️ Important: Add file header comment:
# /**
#  * Demo-only seed: <description>
#  * Contains reference/test data. DO NOT use in production.
#  */

# 3. Test with demo seeds
npm run seed:demo

# 4. Verify demo data exists
npm run verify:no-demo  # Should fail (expected)

# 5. Commit
git add seeds/
git commit -m "feat: add demo seed data"
```

---

## Environment-Specific Behaviors

### `NODE_ENV=development`

```bash
npm run migrate:dev    # Migrate + seed all
npm run seed:demo      # All seeds including demo
npm run db:reset       # Full reset with demo data
```

- Demo data is loaded and used in tests
- Database changes are reversible
- Schema modifications are expected
- Tests use in-memory or fixture data

### `NODE_ENV=production`

```bash
npm run migrate        # Schema only (safe)
npm run seed:prod      # Production seeds only (tokens, chains)
npm run verify:no-demo # Verify no demo data exists
```

- Only production-safe seeds are loaded
- Demo data is never loaded
- Migrations run without demo side effects
- Regression tests prevent demo data leaks

### `NODE_ENV=test`

```bash
npm test               # Run test suite
npm run test:prod-seeds # Test production seeding
npm run test:migrations # Test all migrations
```

- Tests are isolated
- Each test gets fresh database fixtures
- No demo data is seeded automatically
- Migrations are tested for correctness

---

## Troubleshooting

### "Cannot find module" in migrations

```bash
# Ensure all dependencies are installed
npm ci

# Clear node_modules and reinstall
rm -rf node_modules
npm ci

# Then retry
npm run migrate
```

### "Database does not exist"

```bash
# Create database in PostgreSQL
psql -U postgres
CREATE DATABASE paycrypt;
GRANT ALL PRIVILEGES ON DATABASE paycrypt TO paycrypt_user;
\q

# Then run migrations
npm run migrate
```

### "Foreign key constraint failed" during rollback

```bash
# Migrations are rolled back in reverse order
# If a table still references another, check migration order
npm run migrate:status

# Rollback all and re-apply
npm run migrate:rollback:all
npm run migrate
```

### Demo data in production database

```bash
# 1. Verify issue
npm run verify:no-demo

# 2. Check what demo data exists
# See: backend/docs/SEED_CATEGORIZATION.md for queries

# 3. Clean up demo data
# Run cleanup queries from SEED_CATEGORIZATION.md

# 4. Verify clean
npm run verify:no-demo
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# backend-ci.yml: Standard quality checks
- run: npm run lint
- run: npm audit --audit-level=high
- run: npm test

# backend-tests.yml: Extended tests
- run: npm run test:migrations
- run: npm run test:prod-seeds
- run: npm run verify:no-demo
```

### Docker Build

```bash
# Docker image does NOT run migrations/seeds
docker build -f backend/Dockerfile -t paycrypt-backend:latest backend

# Deployment handles migrations/seeds
docker run \
  -e MIGRATE_ON_START=prod \
  -e SEED_ON_START=prod \
  paycrypt-backend:latest
```

---

## Related Documentation

- [Seed Categorization](./docs/SEED_CATEGORIZATION.md) - Production vs demo seeds
- [Rollback Guide](./docs/ROLLBACK_GUIDE.md) - Migration rollback procedures
- [Docker Deployment](./DOCKER_DEPLOYMENT.md) - Container deployment guide
- [Setup Guide](../docs/setup_guide.md) - Initial setup instructions
