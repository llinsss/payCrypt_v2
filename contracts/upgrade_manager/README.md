# Upgrade Manager

The Soroban upgrade manager allows one governance address to propose,
approve, revoke, execute, cancel, and roll back implementation versions.
The approval threshold is one governance approval. Revoking an approval
returns the proposal to `Proposed` and clears `approved_by` in the same
record write; execution is not possible until it is approved again.

## Execution Concurrency

Each proposal records the current version and a monotonic revision it was
based on. Execution succeeds only while both still match. The revision also
detects rollback-to-the-same-version (an ABA change). If another execution or
rollback has changed the current state, execution returns `ExecutionConflict`
(error 13), leaves the proposal approved, and does not overwrite the current
version. This compare-and-set check and the state writes occur within one
Soroban invocation.

## Storage Migration

New installations initialize at storage schema 2. Existing installations
without a schema marker are treated as schema 1 and must be migrated before
proposing, approving, revoking, executing, cancelling, or rolling back. The
governance address calls `migrate_storage(limit)` repeatedly; each call
migrates at most `limit` listed records, where `1 <= limit <= 50`. The cursor
is persisted between calls, and the schema marker advances only when the full
version list has been processed. Reads remain available during migration.
The manager accepts at most 1,000 recorded versions so version-history storage
and history work per invocation remain bounded.

Every batch is checked for missing legacy records before it writes. A failed
invocation returns an error without advancing its cursor or changing records.
The migration scans only the stored version list and has bounded per-call
work; it does not search contract storage for unlisted keys. Schema 2 records
are stored separately from legacy records so old values remain decodable
until migrated. Legacy `Approved` records return to `Proposed` and clear their
approver during migration, because their original execution revision cannot
be reconstructed safely; governance must approve them again after migration.

## Errors

| Code | Error | Meaning |
| --- | --- | --- |
| 1-12 | Existing lifecycle errors | Initialization, authorization, state, implementation, rollback, and proposal-expiry failures; see `UpgradeError` in `src/lib.rs`. |
| 13 | `ExecutionConflict` | The current version or revision no longer matches the proposal's base state. |
| 14 | `StorageMigrationRequired` | A mutating lifecycle call was made before schema 2 migration completed. |
| 15 | `InvalidMigrationLimit` | The batch limit is zero or greater than 50. |
| 16 | `UnsupportedStorageSchema` | The contract encountered a schema it cannot read or migrate. |
| 17 | `MigrationRecordMissing` | A version-list entry has no legacy or already-migrated record. |
| 18 | `ExecutionRevisionOverflow` | The monotonic current-version revision cannot be incremented. |
| 19 | `VersionHistoryFull` | The manager already retains 1,000 versions. |

## Events

All events use `upg_v1` as the first topic. Failed transitions emit no
event.

| Event | Topics after schema tag | Data |
| --- | --- | --- |
| `executed` | previous current version, installed version | `()` |
| `revoked` | version | governance address |
| `migrated` | resulting storage schema | number of listed records processed |
| `rollback` | source version, target version | bounded rollback reason |
