# Database Rollback Guide

## Overview

This project uses [Knex.js](https://knexjs.org/) for database migrations. All
migrations implement both `up()` and `down()` methods, making every schema change
fully reversible.

---

## Commands

### Roll back the last batch of migrations
```bash
npm run migrate:rollback
```

### Roll back all migrations (full reset)
```bash
npm run migrate:rollback:all
```

### Apply all pending migrations
```bash
npm run migrate
```

### Check current migration status
```bash
npm run migrate:status
```

### Full database reset (rollback all, migrate, seed)
```bash
npm run db:reset
```

---

## Migration Version Tracking

Knex automatically tracks applied migrations in the `knex_migrations` table. This
project also maintains a `migration_audit_log` table (created by migration
`20260300000000_create_migration_version_tracking.js`) that logs every `up` and
`down` run with timestamp, environment, and success/failure state.

To query the audit log directly:
```sql
SELECT * FROM migration_audit_log ORDER BY applied_at DESC LIMIT 20;
```

---

## Migration Inventory

All migrations and their rollback behaviour are listed below in execution order.

| File | Table(s) affected | Rollback action |
|------|------------------|-----------------|
| `001_create_users_table.js` | `users` | Drop table |
| `002_create_kycs_table.js` | `kyc` | Drop table |
| `004_create_transactions_table.js` | `transactions` | Drop table |
| `005_create_balances_table.js` | `balances` | Drop table |
| `006_create_tokens_table.js` | `tokens` | Drop table |
| `007_create_chains_table.js` | `chains` | Drop table |
| `008_create_bank_accounts_table.js` | `bank_accounts` | Drop table |
| `009_create_wallets_table.js` | `wallets` | Drop table |
| `011_create_notifications_table.js` | `notifications` | Drop table |
| `012_add_balance_indexes.js` | `balances` | Drop 5 named indexes |
| `013_create_notification_preferences_table.js` | `notification_preferences` | Drop table |
| `20260121175000_create_stellar_tags.js` | `stellar_tags` | Drop table |
| `20260122000000_create_stellar_accounts.js` | `stellar_accounts` | Drop table |
| `20260122000001_create_stellar_transactions.js` | `stellar_transactions` | Drop table |
| `20260122000002_create_webhooks.js` | `webhooks` | Drop table |
| `20260122000003_create_webhook_events.js` | `webhook_events` | Drop table |
| `20260123000000_create_api_keys_table.js` | `api_keys` | Drop table |
| `20260220000000_create_audit_logs_table.js` | `audit_logs` | Drop table |
| `20260220000000_create_scheduled_payments.js` | `scheduled_payments` | Drop table |
| `20260220115816_add_metadata_to_transactions.js` | `transactions` | Drop `metadata` column |
| `20260220120000_create_disputes.js` | `disputes`, `dispute_comments` | Drop both tables |
| `20260220125315_create_tags_table.js` | `tags` | Drop table |
| `20260220150000_add_idempotency_to_transactions.js` | `transactions` | Drop `idempotency_key` column |
| `20260220153000_add_two_factor_fields_to_users.js` | `users` | Drop 3 2FA columns |
| `20260220205900_add_notes_to_transactions.js` | `transactions` | Drop `notes` column |
| `20260220210500_add_rotation_to_api_keys.js` | `api_keys`, `api_key_audit_logs` | Drop table + 4 columns |
| `20260220211500_add_soft_delete_to_transactions.js` | `transactions` | Drop `deleted_at` column |
| `20260300000000_create_migration_version_tracking.js` | `migration_audit_log` | Drop table |

---

## Safe Rollback Procedure

Follow these steps before rolling back in any environment.

### 1. Check current status
```bash
npm run migrate:status
```

### 2. Back up the database (production / staging)
```bash
pg_dump -U $DB_USER -h $DB_HOST $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. Identify the target state

Knex rolls back one *batch* at a time. A batch is the set of migrations that
were applied together in a single `npm run migrate` run. Check which batch you
want to revert:
```sql
SELECT * FROM knex_migrations ORDER BY batch DESC;
```

### 4. Roll back one batch
```bash
npm run migrate:rollback
```

Re-run step 1 to confirm the expected migrations were reverted.

### 5. Verify application health

After rollback, restart the application and run a smoke test to confirm nothing
is broken:
```bash
curl http://localhost:3000/api/health
```

---

## Rollback Warnings

- **Data loss**: Rolling back a `createTable` migration permanently drops that
  table and all its data. Always back up first.
- **Column drops**: Migrations that add columns (e.g. `add_metadata`, `add_notes`)
  will drop those columns and their data on rollback.
- **Dependency order**: Tables with foreign keys must be rolled back before the
  tables they reference. Knex handles this automatically when rolling back by
  batch in reverse order.
- **Stellar tables**: `stellar_transactions` depends on `stellar_accounts`. Both
  are in the same timestamp batch, so Knex will drop them in the correct order.
- **Webhook tables**: `webhook_events` depends on `webhooks`. Drop order is
  `webhook_events` first, then `webhooks`.

---

## Troubleshooting

### "Cannot rollback — no migrations to rollback"
The current batch is already at the initial state. Use `migrate:status` to confirm.

### "Foreign key constraint" error during rollback
A dependent table still exists. Ensure you are rolling back in reverse order or
use `migrate:rollback:all` which handles the full dependency chain.

### Migration stuck in a partial state
Check the `knex_migrations` table and `migration_audit_log` for clues. You may
need to manually clean up the partial schema change and remove the row from
`knex_migrations` before re-running.
```sql
-- Remove a stuck migration record
DELETE FROM knex_migrations WHERE name = '20260220115816_add_metadata_to_transactions.js';
```

Then re-run `npm run migrate` or apply the rollback manually.