# Database Restore Runbook

Step-by-step procedure for restoring the Tagg@d PostgreSQL database from an
automated backup. Automated daily backups are produced by
`backend/scripts/backup.js` (see `backend/workers/backup.js` for the
scheduled job) and are:

- PostgreSQL custom-format dumps (`pg_dump --format=custom`)
- Encrypted with AES-256-GCM when `BACKUP_ENCRYPTION_KEY` is set (files end
  in `.dump.enc`)
- Uploaded to S3 under `s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/` when
  `BACKUP_S3_BUCKET` + AWS credentials are set
- Retained for `BACKUP_RETENTION_DAYS` (default: 30) both locally and in S3
- Recorded in a `<filename>.meta.json` sidecar, listable via
  `GET /api/v1/admin/backups` (admin auth required)

## 1. Locate the backup to restore

**Local disk**

```bash
ls -la "$BACKUP_DIR"   # default: backend/backups
```

**S3**

```bash
aws s3 ls "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/"
aws s3 cp "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/taggedpay_<timestamp>.dump.enc" ./restore.dump.enc
```

**Via the admin API**

```bash
curl -H "Authorization: Bearer <admin_jwt>" \
  "https://<host>/api/v1/admin/backups?limit=10"
```

## 2. Decrypt (if the backup was encrypted)

Backups are encrypted with AES-256-GCM using `BACKUP_ENCRYPTION_KEY`. Decrypt
with the helper shipped in this repo rather than a generic tool, since the
file layout is `[iv (12 bytes)][authTag (16 bytes)][ciphertext]`:

```bash
cd backend
node -e '
  const fs = require("fs");
  const { decryptBuffer } = require("./utils/backupEncryption.js");
  const payload = fs.readFileSync("./restore.dump.enc");
  fs.writeFileSync("./restore.dump", decryptBuffer(payload, process.env.BACKUP_ENCRYPTION_KEY));
'
```

(This uses `require` for a one-liner; since the project is ESM, save it as a
`.mjs` script with `import` if you prefer running it as a file.)

## 3. Verify the dump before restoring

Never restore an unverified file — confirm it's a valid custom-format dump
first:

```bash
pg_restore --list ./restore.dump
```

If this fails, the backup is corrupt or was never a valid PostgreSQL custom
dump — try an earlier backup and, if the issue is systemic, check the
`database-backup` BullMQ job history (Bull Board, or Sentry alerts tagged
`worker: database-backup`) for verification failures.

## 4. Restore to a target database

**Always restore to a scratch/staging database first**, never directly onto
production.

```bash
# Create a scratch database
createdb -h "$DB_HOST" -U "$DB_USER" taggedpay_restore_check

# Restore into it
pg_restore \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname=taggedpay_restore_check \
  --no-owner \
  --no-privileges \
  ./restore.dump
```

Confirm row counts / a few known records look right:

```bash
psql -h "$DB_HOST" -U "$DB_USER" -d taggedpay_restore_check \
  -c "SELECT count(*) FROM users;" \
  -c "SELECT count(*) FROM transactions;"
```

## 5. Point-in-time restore (production incident)

1. **Stop writes**: put the API into maintenance mode or scale backend
   instances to zero so nothing writes to the database mid-restore.
2. **Snapshot current state** (even if corrupted) before overwriting it, in
   case the restore itself needs to be rolled back:
   ```bash
   pg_dump --format=custom --file=pre_restore_snapshot.dump \
     --host="$DB_HOST" --username="$DB_USER" "$DB_NAME"
   ```
3. **Restore** the verified, decrypted dump from step 4 directly onto
   `$DB_NAME` (drop and recreate first, or use `pg_restore --clean
   --if-exists` to overwrite existing objects):
   ```bash
   pg_restore \
     --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
     --dbname="$DB_NAME" --clean --if-exists --no-owner --no-privileges \
     ./restore.dump
   ```
4. **Run pending migrations**, if the backup predates the current schema:
   ```bash
   npm run migrate
   ```
5. **Resume writes**: bring backend instances back online.
6. **Post-incident**: document the restore point (backup timestamp) and the
   data loss window in the incident report — anything written between the
   backup and the incident is gone.

## Cleanup

```bash
dropdb -h "$DB_HOST" -U "$DB_USER" taggedpay_restore_check
rm -f ./restore.dump ./restore.dump.enc
```

## Notes

- Retention: backups older than `BACKUP_RETENTION_DAYS` (default 30) are
  deleted automatically, both locally and in S3, by the same job that
  creates new backups (`backend/workers/backup.js`).
- Job failures raise a Sentry alert tagged `worker: database-backup` —
  treat two consecutive failures as an incident (no verified backup for
  >48h on a financial application is not acceptable).
- **Action required before closing [#393](https://github.com/llinsss/payCrypt_v2/issues/393):**
  this procedure has not yet been executed end-to-end against a staging
  database — do that once staging Postgres/S3 credentials are available,
  then record the date and outcome here. Re-run it after any change to
  `backend/scripts/backup.js` or the dump/restore toolchain version.
