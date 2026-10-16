# Registry Contract

The registry contract stores versioned records and exposes a safe read/upgrade path so
records written by older schema versions can be migrated forward without breaking
existing consumers.

## Schema versioning

Every persisted registry record carries a `schema_version` field. The current schema
version is exposed as a constant so off-chain tooling and other contracts can detect
which layout a stored record uses.

- `SCHEMA_VERSION` — the latest schema version written by this contract.
- Records created by the current schema are stored with `schema_version == SCHEMA_VERSION`.
- Records created by an older schema are stored with their original `schema_version`.

## Read / upgrade path

Reads go through a safe path that inspects the stored `schema_version` before returning
the record:

1. If the stored version equals `SCHEMA_VERSION`, the record is returned as-is.
2. If the stored version is older than `SCHEMA_VERSION`, the record is upgraded in place
to the latest schema and the upgraded record is returned.
3. If the stored version is newer than `SCHEMA_VERSION`, the read fails with
   `SchemaVersionUnsupported` rather than returning a record this contract cannot
   interpret.

Upgrades are bounded: each read touches at most one record, and the upgrade writes back
the same record with the new `schema_version`, so storage growth stays constant per
record.

## Errors

| Error | Meaning |
| --- | --- |
| `NotFound` | No record exists for the requested key. |
| `SchemaVersionUnsupported` | The stored record's schema version is newer than `SCHEMA_VERSION`. |
| `SchemaVersionOverflow` | Incrementing the schema version would overflow. |

## Events

- `upgraded` — emitted when a stored record is migrated from an older schema version to
  `SCHEMA_VERSION`. The event includes the key and the previous and new schema versions.

## Authorization

Upgrades performed during a read do not require additional authorization beyond the
caller's existing read access; the upgrade only rewrites the record's schema metadata and
preserves the original record contents.
