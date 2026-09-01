# Production Deployment Checklist

Critical pre-deployment and post-deployment checks for PayCrypt backend. **Follow this checklist on every production deployment to prevent demo data contamination and schema inconsistencies.**

---

## Pre-Deployment (Local Development)

### Code Review

- [ ] All commits are code-reviewed and approved
- [ ] No hardcoded credentials or secrets in code
- [ ] No demo data markers in non-seed files:
  - [ ] No `@demo_` or `@demo.tagged.local` in source code
  - [ ] No `demo-tx-` or `0xdemo` in business logic
  - [ ] No `DemoPass123!` hardcoded anywhere
- [ ] Database schema changes are backward compatible

### Migration Tests

- [ ] Run migration tests locally: `npm run test:migrations`
- [ ] Verify migrations pass: ✅ All migrations apply
- [ ] Verify rollbacks work: ✅ All migrations roll back
- [ ] Test on clean database:
  ```bash
  npm run migrate:rollback:all
  npm run migrate
  ```

### Seed Tests

- [ ] Run production seed regression test: `npm run test:prod-seeds`
- [ ] Verify no demo data: `npm run verify:no-demo`
- [ ] Test production seeding flow:
  ```bash
  npm run migrate:rollback:all
  npm run migrate
  npm run seed:prod
  npm run verify:no-demo  # Should pass
  ```

### Code Quality

- [ ] Run linter: `npm run lint` ✅ No errors
- [ ] Run security audit: `npm audit --audit-level=high` ✅ No critical issues
- [ ] Run full test suite: `npm run test:all` ✅ All pass

### Docker Image

- [ ] Build Docker image locally:
  ```bash
  docker build -t paycrypt-backend:test backend
  ```
- [ ] Test image with production config:
  ```bash
  docker run \
    -e MIGRATE_ON_START=prod \
    -e SEED_ON_START=prod \
    -e NODE_ENV=production \
    -e DB_HOST=postgres \
    -e DB_NAME=paycrypt_test \
    paycrypt-backend:test
  ```
- [ ] Verify health endpoint: `curl http://localhost:3000/api/health`
- [ ] Verify no demo data in container logs

---

## Staging Deployment

### Pre-Deployment

- [ ] Staging database backup created
- [ ] Deployment plan documented (who, when, rollback steps)
- [ ] On-call person identified
- [ ] Communication channel established for issues

### Deployment

- [ ] Deploy to staging environment
- [ ] Verify container health checks pass
- [ ] Verify database connectivity
- [ ] Run migrations: ✅ Success
- [ ] Verify no demo data: `npm run verify:no-demo` ✅ Pass

### Post-Deployment

- [ ] Application health checks pass: `GET /api/health`
- [ ] API endpoints responding correctly
- [ ] Database transactions working correctly
- [ ] Logs show no errors or warnings
- [ ] Performance metrics within baseline
- [ ] Security headers present in responses
- [ ] Verify once more: no demo data in database

### Verification Queries

Run these on staging database to verify integrity:

```sql
-- Verify no demo users
SELECT COUNT(*) as demo_user_count FROM users 
WHERE email LIKE '%@demo.tagged.local%' OR tag LIKE '@demo_%';
-- Expected: 0

-- Verify production data exists
SELECT COUNT(*) as token_count FROM tokens;
-- Expected: >= 6

SELECT COUNT(*) as chain_count FROM chains;
-- Expected: >= 6

-- Verify no demo transactions
SELECT COUNT(*) as demo_tx_count FROM transactions 
WHERE reference LIKE 'demo-tx-%' OR tx_hash LIKE '0xdemo%';
-- Expected: 0
```

---

## Production Deployment

### Pre-Deployment

- [ ] Staging deployment successful and verified
- [ ] Production database backup created
  ```bash
  pg_dump -U $DB_USER -h $DB_HOST $DB_NAME > \
    backup_prod_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Backup verified and stored securely
- [ ] Rollback plan documented and tested
- [ ] On-call person identified and ready
- [ ] Maintenance window communicated to users (if needed)

### Deployment Steps

**Step 1: Verify pre-deployment state**

```bash
# On production server, check current state
npm run migrate:status

# Note: Current batch number and migration list
```

**Step 2: Pull latest code**

```bash
git pull origin master
npm ci --omit=dev
```

**Step 3: Run migrations**

```bash
# Schema-only, safe for production
npm run migrate

# Verify success
npm run migrate:status

# All migrations should show as applied
```

**Step 4: Seed production data**

```bash
# Load production-safe seeds (tokens, chains)
npm run seed:prod

# Verify success
npm run verify:no-demo

# Should print: "✓ No demo data detected"
```

**Step 5: Start/restart application**

```bash
# Using systemd or docker:
systemctl restart paycrypt-backend

# Or docker:
docker restart paycrypt-backend
```

**Step 6: Verify health**

```bash
# Check health endpoint
curl http://localhost:3000/api/health

# Verify response: 200 OK with healthy status
```

### Post-Deployment

- [ ] Application is running: `curl http://localhost:3000/api/health` ✅ 200 OK
- [ ] No errors in application logs
- [ ] Database connectivity working
- [ ] API endpoints responsive:
  - [ ] `GET /api/users/profile` (requires auth token)
  - [ ] `GET /api/transactions` (requires auth token)
- [ ] Verification: No demo data
  ```bash
  npm run verify:no-demo
  # Expected: ✓ No demo data detected
  ```

### Production Verification Queries

Run these queries on production database immediately after deployment:

```sql
-- 1. Verify schema is complete
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';
-- Expected: >= 25 tables

-- 2. Verify NO demo users exist
SELECT COUNT(*) as demo_user_count FROM users 
WHERE email LIKE '%@demo.tagged.local%' OR tag LIKE '@demo_%';
-- Expected: 0 (CRITICAL)

-- 3. Verify NO demo transactions exist
SELECT COUNT(*) as demo_tx_count FROM transactions 
WHERE reference LIKE 'demo-tx-%' OR tx_hash LIKE '0xdemo%';
-- Expected: 0 (CRITICAL)

-- 4. Verify production tokens exist
SELECT COUNT(*) as token_count FROM tokens;
-- Expected: >= 6

-- 5. Verify production chains exist
SELECT COUNT(*) as chain_count FROM chains;
-- Expected: >= 6

-- 6. Verify NO demo stellar data
SELECT COUNT(*) as demo_stellar FROM stellar_tags 
WHERE tag IN ('@stellar_demo', '@test_account');
-- Expected: 0 (CRITICAL)

-- 7. Verify NO demo scheduled payments
SELECT COUNT(*) as demo_scheduled FROM scheduled_payments 
WHERE memo LIKE 'demo-schedule-%';
-- Expected: 0 (CRITICAL)

-- If ANY of the CRITICAL queries return > 0, ROLLBACK immediately
```

### Monitoring After Deployment

Monitor for 1 hour post-deployment:

- [ ] Error rate: normal (baseline)
- [ ] Response times: normal (baseline)
- [ ] Database connections: stable
- [ ] Memory usage: stable
- [ ] No unexpected errors in logs
- [ ] No security alerts

---

## Rollback Procedure (If Needed)

**IF any verification query shows demo data, STOP and follow this procedure:**

### Immediate Actions

```bash
# 1. Stop the application
systemctl stop paycrypt-backend
# or
docker stop paycrypt-backend

# 2. Restore from pre-deployment backup
psql -U $DB_USER -h $DB_HOST $DB_NAME < backup_prod_TIMESTAMP.sql

# 3. Verify backup restoration
psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c \
  "SELECT COUNT(*) FROM users WHERE email LIKE '%@demo.tagged.local%';"
# Expected: 0

# 4. Start application with previous code
git checkout HEAD~1
npm ci --omit=dev
systemctl start paycrypt-backend

# 5. Verify application is running
curl http://localhost:3000/api/health

# 6. Notify team immediately
# - Document what went wrong
# - Schedule post-mortem
```

### Root Cause Analysis

1. Check which seed file caused the issue
2. Verify seed file header comment (should say "Production-safe" or "Demo-only")
3. Audit seed file for demo data markers:
   - `@demo_` or `@demo.tagged.local`
   - `demo-tx-` or `0xdemo`
   - `demo-schedule-`
4. If demo seed was mistakenly run:
   - Identify which seed file
   - Remove from production-safe seeds
   - Add header comment marking as demo-only
   - Re-run code review and testing
   - Deploy fix separately

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| On-Call DBA | TBD | 24/7 |
| On-Call Backend Lead | TBD | 24/7 |
| DevOps Lead | TBD | Business hours |

---

## Documentation References

- [Seed Categorization](./docs/SEED_CATEGORIZATION.md) - Production vs demo seeds
- [Rollback Guide](./docs/ROLLBACK_GUIDE.md) - Detailed rollback procedures
- [Docker Deployment](./DOCKER_DEPLOYMENT.md) - Container deployment options
- [Scripts & Commands](./SCRIPTS_AND_COMMANDS.md) - All available commands
- [Setup Guide](../docs/setup_guide.md) - General setup information

---

## Deployment Sign-Off

Deployments must be signed off by authorized personnel before going to production.

**Deployed By:** _________________ **Date/Time:** _________________

**Reviewed By:** _________________ **Date/Time:** _________________

**Verified By:** _________________ **Date/Time:** _________________

**All checks passed:** ☐ Yes ☐ No (if no, explain below)

**Notes:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

---

## Version History

| Date | Deployer | Version | Notes |
|------|----------|---------|-------|
| | | | |
| | | | |
| | | | |
