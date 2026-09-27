# Backup Integrity & Automated Restore Drills

## Overview

Creating an encrypted `pg_dump` archive does not prove it can be **decrypted and
restored**. This document describes the checksum and automated restore-drill
support added for issue #583, and the manual recovery procedure after an
encryption-key rotation.

## What the backup run records

Every run of `npm run backup:db` (`scripts/backup.js`) now:

1. Streams the final archive through **SHA-256** and stores the digest in the
   `*.meta.json` sidecar (`checksum`, `checksumAlgorithm`).
2. Keeps the existing import-time `pg_restore --list` verification of the
   plaintext dump before encryption.

```jsonc
// taggedpay_20260828T020000Z.dump.enc.meta.json
{
  "filename": "taggedpay_20260828T020000Z.dump.enc",
  "createdAt": "2026-08-28T02:00:03.512Z",
  "sizeBytes": 184320,
  "verified": true,
  "encrypted": true,
  "uploadedToS3": true,
  "checksum": "9f2c…",
  "checksumAlgorithm": "sha256"
}
```

## Automated restore drill

```bash
npm run backup:drill        # node scripts/backup.js --drill
```

The drill (`runRestoreDrill`) takes the **most recent tracked backup** and:

1. Re-hashes the archive and compares it to the recorded checksum — catches
   silent bit-rot / truncation / tampering.
2. If the archive is `*.enc`, decrypts it with `BACKUP_ENCRYPTION_KEY` into an
   **isolated temp file** that is always removed afterwards — this is what
   proves the configured key still works.
3. Runs `pg_restore --list` on the resulting custom-format dump to confirm the
   archive is structurally restorable.

It never throws for a failed drill; the outcome is written to
`backups/restore-drill.json` and returned:

```jsonc
{
  "testedAt": "2026-08-28T03:00:01.004Z",
  "filename": "taggedpay_20260828T020000Z.dump.enc",
  "ok": true,
  "checksumOk": true,
  "restoreOk": true,
  "backupAgeMs": 3600000,   // how old the drilled backup was
  "durationMs": 812,
  "error": null
}
```

### Metrics / alerting

`GET /api/admin/backups` now returns a `restoreDrill` object with the last
drill result plus `ageMs` (how long ago the drill itself ran). Alert when:

- `restoreDrill` is `null` or `restoreDrill.ageMs` exceeds your drill interval
  (the drill is not running), or
- `restoreDrill.ok === false` (backups are not provably restorable), or
- `restoreDrill.backupAgeMs` exceeds `BACKUP_SCHEDULE_CRON` cadence (backups
  are not being produced).

### Scheduling

Add a host cron entry a few minutes after the backup window, e.g.:

```cron
0 2 * * *  cd /srv/app/backend && npm run backup:db
30 2 * * * cd /srv/app/backend && npm run backup:drill
```

## Key-rotation recovery

Archives are encrypted with `BACKUP_ENCRYPTION_KEY` (AES-256-GCM, see
`utils/backupEncryption.js`). A rotation makes **older archives undecryptable
with the new key**. Procedure:

1. **Before rotating**, run `npm run backup:drill` and confirm `checksumOk` and
   `restoreOk` are `true` for the newest archive under the *current* key.
2. Keep the outgoing key available under a versioned name
   (`BACKUP_ENCRYPTION_KEY_PREVIOUS`) in your secret manager for at least the
   retention window (`BACKUP_RETENTION_DAYS`, default 30).
3. Deploy the new `BACKUP_ENCRYPTION_KEY`. The next scheduled backup is written
   under the new key.
4. Run `npm run backup:drill` again — it should pass under the new key.
5. To restore an **archive written under the previous key**, set
   `BACKUP_ENCRYPTION_KEY` to that previous key for the restore session only:

   ```bash
   BACKUP_ENCRYPTION_KEY="$OLD_KEY" node -e '
     import("./scripts/backup.js").then(async (m) => {
       const r = await m.verifyBackupIntegrity(
         "backups/taggedpay_20260701T020000Z.dump.enc",
         { encryptionKey: process.env.BACKUP_ENCRYPTION_KEY },
       );
       console.log(r);
     })'
   ```

6. Once every retained archive predates the rotation, retire the previous key.

If a drill reports `restoreOk: false` with a decryption error immediately after
a rotation, the deployed key does not match the key the newest archive was
written with — roll `BACKUP_ENCRYPTION_KEY` back and investigate before the old
archives age out.
