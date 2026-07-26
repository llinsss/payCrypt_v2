# Migration Audit Report

**Date:** 2026-07-26
**Issue:** #392 — Audit and Fix Database Migration Numbering Gaps

## Executive Summary

The `backend/migrations/` directory contained 48 migration files with a naming
convention gap: sequential numbers `001`–`013` jump directly to timestamp-based
names (`20250324_...`).  Numbers `003` and `014`–`019` are absent.  One
backfill migration was required for a table used in code but never created, and
one file had an inconsistent timestamp format.

---

## Gaps Identified

### 1. Missing Sequential Numbers (`003`, `014`–`019`)

| Number | Status | Explanation |
|--------|--------|-------------|
| `003`  | Never existed | No evidence of a lost migration; likely skipped during initial development. No schema elements depend on it. |
| `014`–`019` | Never existed | The project switched from sequential to timestamp naming after `013`. These numbers were never assigned. |

**Resolution:** No action required. The sequential-to-timestamp transition is
documented below. These numbers are left intentionally unused.

### 2. Missing CREATE Migration — `reconciliation_reports`

**Problem:** The table `reconciliation_reports` is queried and inserted in:
- `services/ReconciliationService.js` (lines 213, 236, 260)
- `services/EvmReconciliationService.js` (line 484)

An ALTER migration (`20250324_add_chain_to_reconciliation_reports.js`) adds
columns `chain`, `native_symbol`, and `token_breakdown` to this table, but
**no CREATE migration existed**.

**Resolution:** Created backfill migration
`20250324000000_create_reconciliation_reports_table.js` with all columns
derived from the codebase's INSERT and SELECT statements.  The migration
includes an `if not exist` guard so it is safe on databases where the table
already exists (e.g., created manually or via a SQL script).

### 3. Inconsistent Timestamp Naming — `20260325_add_download_jti.js`

**Problem:** This file used the format `YYYYMMDD_description` instead of the
standard `YYYYMMDDHHMMSS_description`.

**Resolution:** Renamed to `20260325000000_add_download_jti.js`.

---

## Migration Inventory (Post-Fix)

### Sequential Migrations (`001`–`013`)

| File | Action |
|------|--------|
| `001_create_users_table.js` | CREATE `users` |
| `002_create_kycs_table.js` | CREATE `kyc` |
| `004_create_transactions_table.js` | CREATE `transactions` |
| `005_create_balances_table.js` | CREATE `balances` |
| `006_create_tokens_table.js` | CREATE `tokens` |
| `007_create_chains_table.js` | CREATE `chains` |
| `008_create_bank_accounts_table.js` | CREATE `bank_accounts` |
| `009_create_wallets_table.js` | CREATE `wallets` |
| `010_add_columns_to_balances_table.js` | ALTER `balances` |
| `011_create_notifications_table.js` | CREATE `notifications` |
| `012_add_balance_indexes.js` | ALTER `balances` (indexes) |
| `013_create_notification_preferences_table.js` | CREATE `notification_preferences` |

### Timestamp Migrations (chronological)

| File | Action |
|------|--------|
| `20250324000000_create_reconciliation_reports_table.js` | **NEW** — CREATE `reconciliation_reports` |
| `20250324_add_chain_to_reconciliation_reports.js` | ALTER `reconciliation_reports` |
| `20250324_add_search_vector_to_transactions.js` | ALTER `transactions` |
| `20260121175000_create_stellar_tags.js` | CREATE `stellar_tags` |
| `20260122000000_create_stellar_accounts.js` | CREATE `stellar_accounts` |
| `20260122000001_create_stellar_transactions.js` | CREATE `stellar_transactions` |
| `20260122000002_create_webhooks.js` | CREATE `webhooks` |
| `20260122000003_create_webhook_events.js` | CREATE `webhook_events` |
| `20260122000004_webhook_events_idempotency.js` | ALTER `webhook_events` |
| `20260123000000_create_api_keys_table.js` | CREATE `api_keys` |
| `20260220000000_create_audit_logs_table.js` | CREATE `audit_logs` |
| `20260220000000_create_scheduled_payments.js` | CREATE `scheduled_payments` |
| `20260220115816_add_metadata_to_transactions.js` | ALTER `transactions` |
| `20260220120000_create_disputes.js` | CREATE `disputes`, `dispute_comments` |
| `20260220125315_create_tags_table.js` | CREATE `tags` |
| `20260220125451_create_transaction_tags_table.js` | CREATE `transaction_tags` |
| `20260220150000_add_idempotency_to_transactions.js` | ALTER `transactions` |
| `20260220153000_add_two_factor_fields_to_users.js` | ALTER `users` |
| `20260220174000_add_currency_to_users.js` | ALTER `users` |
| `20260220205900_add_notes_to_transactions.js` | ALTER `transactions` |
| `20260220210500_add_rotation_to_api_keys.js` | ALTER `api_keys`, CREATE `api_key_audit_logs` |
| `20260220211500_add_soft_delete_to_transactions.js` | ALTER `transactions` |
| `20260221200700_add_search_vector_to_transactions.js` | ALTER `transactions` |
| `20260222000000_create_export_exports_table.js` | CREATE `export_exports` |
| `20260300000000_create_migration_version_tracking.js` | CREATE `migration_audit_log` |
| `20260301000000_add_ussd_support.js` | ALTER `users`, `transactions` |
| `20260301000002_add_rate_limit_tiers.js` | ALTER `users`, `api_keys` |
| `20260324000000_create_payment_batches_table.js` | CREATE `payment_batches`, ALTER `transactions` |
| `20260325000000_add_download_jti.js` | ALTER `export_exports` **(renamed for consistency)** |
| `20260325000001_add_webhook_delivery_tracking.js` | ALTER `webhook_events` |
| `20260326000000_add_fingerprint_unique_to_transactions.js` | ALTER `transactions` |
| `20260326000001_add_rejection_reason_to_kyc.js` | ALTER `kyc` |
| `20260326000002_create_withdrawals_table.js` | CREATE `withdrawals` |
| `20260326000003_add_status_to_stellar_tags.js` | ALTER `stellar_tags` |
| `20260327000000_create_multi_sig_wallets_tables.js` | CREATE 5 `multi_sig_*` tables |
| `20260723000000_create_device_tokens_table.js` | CREATE `device_tokens` |
| `20260724000000_audit_logs_retention_index.js` | ALTER `audit_logs` (index) |

---

## Schema Coverage Verification

Every table and column referenced in application code has a corresponding
migration:

| Table | Create Migration | Alter Migrations |
|-------|-----------------|------------------|
| `users` | `001` | `20260220153000`, `20260220174000`, `20260301000000`, `20260301000002` |
| `kyc` | `002` | `20260326000001` |
| `transactions` | `004` | `20250324_add_search_vector`, `20260220115816`, `20260220150000`, `20260220205900`, `20260220211500`, `20260221200700`, `20260301000000`, `20260324000000`, `20260326000000` |
| `balances` | `005` | `010`, `012` |
| `tokens` | `006` | — |
| `chains` | `007` | — |
| `bank_accounts` | `008` | — |
| `wallets` | `009` | — |
| `notifications` | `011` | — |
| `notification_preferences` | `013` | — |
| `reconciliation_reports` | **`20250324000000` (NEW)** | `20250324_add_chain` |
| `stellar_tags` | `20260121175000` | `20260326000003` |
| `stellar_accounts` | `20260122000000` | — |
| `stellar_transactions` | `20260122000001` | — |
| `webhooks` | `20260122000002` | — |
| `webhook_events` | `20260122000003` | `20260122000004`, `20260325000001` |
| `api_keys` | `20260123000000` | `20260220210500`, `20260301000002` |
| `api_key_audit_logs` | `20260220210500` | — |
| `audit_logs` | `20260220000000` | `20260724000000` |
| `scheduled_payments` | `20260220000000` | — |
| `disputes` | `20260220120000` | — |
| `dispute_comments` | `20260220120000` | — |
| `tags` | `20260220125315` | — |
| `transaction_tags` | `20260220125451` | — |
| `export_exports` | `20260222000000` | `20260325000000` |
| `migration_audit_log` | `20260300000000` | — |
| `payment_batches` | `20260324000000` | — |
| `withdrawals` | `20260326000002` | — |
| `multi_sig_wallets` | `20260327000000` | — |
| `multi_sig_cosigners` | `20260327000000` | — |
| `multi_sig_proposals` | `20260327000000` | — |
| `multi_sig_approvals` | `20260327000000` | — |
| `multi_sig_notifications` | `20260327000000` | — |
| `device_tokens` | `20260723000000` | — |

---

## Migration Naming Convention (Going Forward)

All new migrations **must** use the format:

```
YYYYMMDDHHMMSS_description.js
```

- `YYYY` — 4-digit year
- `MM` — 2-digit month (01–12)
- `DD` — 2-digit day (01–31)
- `HH` — 2-digit hour (00–23)
- `MM` — 2-digit minute (00–59)
- `SS` — 2-digit second (00–59)
- `description` — snake_case description of the change

Example: `20260801120000_add_refresh_tokens_to_users.js`

### Why timestamp naming?

- Prevents numbering conflicts in parallel development branches.
- Guarantees chronological ordering without manual coordination.
- Aligns with Knex's default `knex migrate:make` output.
- The legacy `001`–`013` files are retained for backward compatibility with
  existing `knex_migrations` records.  They are never to be renamed.
