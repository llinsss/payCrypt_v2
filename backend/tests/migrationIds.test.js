import { describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  RENAMED_MIGRATIONS,
  findMigrationIdProblems,
  syncRenamedMigrations,
} from "../utils/migrationIds.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const migrationFiles = fs.readdirSync(migrationsDir);

describe("migration identifiers", () => {
  it("are unique and well-formed in the migrations directory", () => {
    expect(findMigrationIdProblems(migrationFiles)).toEqual([]);
  });

  it("reports duplicate ids", () => {
    const problems = findMigrationIdProblems([
      "20260220000000_create_audit_logs_table.js",
      "20260220000000_create_scheduled_payments.js",
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("duplicate id 20260220000000");
  });

  it("reports ids whose filename order differs from numeric order", () => {
    const problems = findMigrationIdProblems([
      "20250324000000_create_reconciliation_reports_table.js",
      "20250324_add_chain_to_reconciliation_reports.js",
    ]);
    expect(problems).toEqual([
      "20250324_add_chain_to_reconciliation_reports.js: id 20250324 sorts after 20250324000000_create_reconciliation_reports_table.js but is numerically smaller",
    ]);
  });

  it("reports malformed filenames and ignores non-js files", () => {
    expect(findMigrationIdProblems(["2026-bad.js", "README.md"])).toEqual([
      "2026-bad.js: name must match <numeric id>_<snake_case>.js",
    ]);
  });

  it("preserves the original execution order of renamed migrations", () => {
    const sorted = [...migrationFiles].sort();
    const indexOf = (file) => sorted.indexOf(file);

    expect(indexOf("20260220000001_create_scheduled_payments.js")).toBe(
      indexOf("20260220000000_create_audit_logs_table.js") + 1,
    );
    expect(indexOf("20250324000001_add_chain_to_reconciliation_reports.js")).toBe(
      indexOf("20250324000000_create_reconciliation_reports_table.js") + 1,
    );
    expect(indexOf("20250324000002_add_search_vector_to_transactions.js")).toBe(
      indexOf("20250324000001_add_chain_to_reconciliation_reports.js") + 1,
    );
  });

  it("maps every renamed migration to a file that exists", () => {
    for (const [oldName, newName] of Object.entries(RENAMED_MIGRATIONS)) {
      expect(migrationFiles).not.toContain(oldName);
      expect(migrationFiles).toContain(newName);
    }
  });
});

describe("syncRenamedMigrations", () => {
  const fakeKnex = ({ hasTable, updated = 1 }) => {
    const update = jest.fn().mockResolvedValue(updated);
    const where = jest.fn(() => ({ update }));
    const knex = jest.fn(() => ({ where }));
    knex.schema = { hasTable: jest.fn().mockResolvedValue(hasTable) };
    return { knex, where, update };
  };

  it("is a no-op on a fresh database", async () => {
    const { knex } = fakeKnex({ hasTable: false });
    await expect(syncRenamedMigrations(knex)).resolves.toBe(0);
    expect(knex).not.toHaveBeenCalled();
  });

  it("renames previously applied records on an existing database", async () => {
    const { knex, where, update } = fakeKnex({ hasTable: true });
    const renames = Object.entries(RENAMED_MIGRATIONS);

    await expect(syncRenamedMigrations(knex)).resolves.toBe(renames.length);
    expect(knex).toHaveBeenCalledWith("knex_migrations");
    for (const [oldName, newName] of renames) {
      expect(where).toHaveBeenCalledWith({ name: oldName });
      expect(update).toHaveBeenCalledWith({ name: newName });
    }
  });
});
