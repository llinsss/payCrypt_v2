# Seed Data Categorization

## Overview

This document clarifies which seed files are production-safe and which contain demo/development-only data. This separation is critical to prevent demo data from contaminating production deployments.

**Key Principle:** Schema migrations are separate from data seeding. Migrations create tables; seeds populate data. Production deployments must run migrations only, then selectively run production-safe seeds.

---

## Seed File Categories

### Production-Safe Seeds ✅

These seeds contain essential system data with **no demo or reference content**. They are safe to run in production environments.

#### 1. `01_production_tokens_seed.js`

**Purpose:** Registers blockchain tokens across supported chains.

**Data Included:**
- Token definitions for Starknet, Lisk, Base, Flow, U2U Network, and Stellar
- Real token symbols, addresses, decimals, and pricing data
- Logo URLs and chain associations

**Production Status:** ✅ SAFE  
**Safe in:** Development, Staging, Production

**Usage:**
```bash
npm run seed:prod      # Runs production-safe seeds only
npm run seed           # Runs all seeds (production + demo)
```

#### 2. `02_production_chains_seed.js`

**Purpose:** Registers supported blockchain networks.

**Data Included:**
- Chain configurations for Starknet, Lisk, Base, Flow, U2U Network, and Stellar
- RPC URLs, block explorers, and native currency definitions
- Chain metadata required for transaction processing

**Production Status:** ✅ SAFE  
**Safe in:** Development, Staging, Production

**Usage:**
```bash
npm run seed:prod      # Runs production-safe seeds only
npm run seed           # Runs all seeds (production + demo)
```

---

### Demo/Development-Only Seeds ⚠️

These seeds contain reference accounts, sample data, or test fixtures. They **MUST NOT** be used in production.

#### 3. `03_demo_stellar_example_data.js`

**Purpose:** Creates example Stellar tags and accounts for SDK testing.

**Data Included:**
- Demo Stellar tags: `@stellar_demo`, `@test_account`
- Sample Stellar addresses and account metadata
- Non-functional test data for Stellar integration testing

**Production Status:** ❌ DO NOT USE IN PRODUCTION  
**Safe in:** Development, Staging (local testing only)

**Identifier:** Demo accounts are clearly marked with `@` prefix (e.g., `@stellar_demo`)

**Usage:**
```bash
npm run seed:demo      # Runs all seeds including demo data
npm run migrate:dev    # Runs migrations + all seeds (dev convenience)
```

#### 4. `04_demo_users_wallets.js`

**Purpose:** Creates demo users and their associated wallets/balances.

**Data Included:**
- 5 demo users with predictable credentials:
  - `@demo_alice` (alice@demo.tagged.local)
  - `@demo_bola` (bola@demo.tagged.local)
  - `@demo_chidi` (chidi@demo.tagged.local)
  - `@demo_dayo` (dayo@demo.tagged.local)
  - `@demo_eni` (eni@demo.tagged.local)
- Hardcoded password: `DemoPass123!`
- Wallet balances: 1000 per user
- Balance entries for all demo tokens

**Production Status:** ❌ DO NOT USE IN PRODUCTION  
**Safe in:** Development, Local Testing

**Identifier:** Demo users have `@demo_` tag prefix and `.tagged.local` email domain

**Usage:**
```bash
npm run seed:demo      # Runs all seeds including demo data
npm run migrate:dev    # Runs migrations + all seeds (dev convenience)
```

#### 5. `05_demo_transactions.js`

**Purpose:** Creates sample transaction and scheduled payment history.

**Data Included:**
- 50 demo transactions between demo users
- Transactions reference `demo-tx-XX` format
- Transaction hashes prefixed with `0xdemo`
- 5 scheduled payments between demo users
- Scheduled payment memos: `demo-schedule-X` format

**Production Status:** ❌ DO NOT USE IN PRODUCTION  
**Safe in:** Development, Testing, Demo Environments

**Identifier:** Transactions have `demo-tx-XX` reference and `0xdemo` hash prefix

**Usage:**
```bash
npm run seed:demo      # Runs all seeds including demo data
npm run migrate:dev    # Runs migrations + all seeds (dev convenience)
```

---

## Usage Guide

### Development Environment

```bash
# Initial setup: run migrations + all seeds (including demo)
npm run migrate:dev

# Or separately:
npm run migrate        # Schema only
npm run seed:demo      # All seeds (production + demo)
```

### Staging/QA Environment

```bash
# Setup: run migrations + production-safe seeds only
npm run migrate        # Schema only
npm run seed:prod      # Production-safe seeds only
```

### Production Environment

```bash
# Setup: run migrations + production-safe seeds only
npm run migrate        # Schema only
npm run seed:prod      # Production-safe seeds only

# Never run these in production:
npm run seed           # ❌ Includes demo data
npm run seed:demo      # ❌ Demo-only
npm run migrate:dev    # ❌ Includes demo seeding
npm run db:reset       # ❌ Destructive + includes demo data
```

---

## Verification: Identifying Demo Data

### User Accounts

**Demo markers:**
- Email domain: `.tagged.local`
- Tag prefix: `@demo_`
- Hardcoded password: `DemoPass123!` (never use in production)

**Query to find demo users:**
```sql
SELECT * FROM users WHERE email LIKE '%@demo.tagged.local%' OR tag LIKE '@demo_%';
```

### Transactions

**Demo markers:**
- Reference starts with `demo-tx-`
- Transaction hash starts with `0xdemo`
- Description contains "Development demo transfer"

**Query to find demo transactions:**
```sql
SELECT * FROM transactions WHERE reference LIKE 'demo-tx-%' OR tx_hash LIKE '0xdemo%';
```

### Stellar Tags

**Demo markers:**
- Tag: `@stellar_demo` or `@test_account`

**Query to find demo Stellar data:**
```sql
SELECT * FROM stellar_tags WHERE tag IN ('@stellar_demo', '@test_account');
```

### Scheduled Payments

**Demo markers:**
- Memo starts with `demo-schedule-`

**Query to find demo scheduled payments:**
```sql
SELECT * FROM scheduled_payments WHERE memo LIKE 'demo-schedule-%';
```

---

## CI/CD Integration

### GitHub Actions

**Backend CI (backend-ci.yml):**
- Tests run with schema only (migrations)
- Demo data is NOT seeded during CI tests
- Tests should be self-contained or use test fixtures

**Docker Build (docker-build.yml):**
- Docker images do NOT include seed data
- Seeding happens after container deployment
- Production deployments run `npm run migrate && npm run seed:prod`

---

## Migration Path

If you have existing demo data in a production database:

1. **Identify** all demo records using queries above
2. **Backup** the production database first
3. **Remove** demo data:
   ```sql
   DELETE FROM transactions WHERE reference LIKE 'demo-tx-%' OR tx_hash LIKE '0xdemo%';
   DELETE FROM scheduled_payments WHERE memo LIKE 'demo-schedule-%';
   DELETE FROM stellar_tags WHERE tag IN ('@stellar_demo', '@test_account');
   DELETE FROM balances WHERE user_id IN (
     SELECT id FROM users WHERE email LIKE '%@demo.tagged.local%'
   );
   DELETE FROM wallets WHERE user_id IN (
     SELECT id FROM users WHERE email LIKE '%@demo.tagged.local%'
   );
   DELETE FROM users WHERE email LIKE '%@demo.tagged.local%';
   ```
4. **Verify** no demo data remains

---

## Adding New Seeds

When adding new seed files, follow these guidelines:

1. **Determine Safety:** Is this data production-ready or for development only?
2. **File Naming:**
   - Production: `NN_production_<name>_seed.js`
   - Demo: `NN_demo_<name>_seed.js`
3. **Add Header Comment:** Clearly mark production status at the top of the file
4. **Use Prefixes:** Demo data should use identifiable prefixes (`@demo_`, `demo-`, etc.)
5. **Update Scripts:** If adding demo-only seeds, ensure they only run with `seed:demo`
6. **Document:** Update this file with the new seed category and usage

---

## Related Documentation

- [Database Migrations](./ROLLBACK_GUIDE.md) - Schema migration and rollback procedures
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment procedures
- [Testing Guide](../TESTING.md) - Test database setup and fixtures
