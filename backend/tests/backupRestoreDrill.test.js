import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

import {
  computeChecksum,
  verifyBackupIntegrity,
  runRestoreDrill,
} from "../scripts/backup.js";
import {
  writeBackupMetadata,
  recordRestoreDrill,
  readRestoreDrill,
} from "../utils/backupMetadata.js";
import { encryptBuffer } from "../utils/backupEncryption.js";

const DUMP_BYTES = Buffer.from("PGDMPmock-custom-format-dump-body");
const KEY = "a".repeat(64); // 32-byte hex key

describe("backup restore drill (issue #583)", () => {
  let tempDir;
  let listImpl;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paycrypt-restore-drill-test-"));
    listImpl = jest.fn().mockResolvedValue({ stdout: "archive listing", stderr: "" });
  });

  afterEach(async () => {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("computes a stable sha256 checksum", async () => {
    const filePath = path.join(tempDir, "dump.bin");
    await fs.writeFile(filePath, DUMP_BYTES);

    const a = await computeChecksum(filePath);
    const b = await computeChecksum(filePath);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a plaintext dump whose checksum matches", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260101T000000Z.dump");
    await fs.writeFile(filePath, DUMP_BYTES);
    const checksum = await computeChecksum(filePath);

    const result = await verifyBackupIntegrity(filePath, {
      expectedChecksum: checksum,
      execFileImpl: listImpl,
    });

    expect(result).toMatchObject({ checksumOk: true, restoreOk: true, ok: true });
    expect(listImpl).toHaveBeenCalledWith("pg_restore", ["--list", filePath], expect.any(Object));
  });

  it("rejects a corrupted archive whose bytes no longer match the checksum", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260101T000000Z.dump");
    await fs.writeFile(filePath, DUMP_BYTES);
    const checksum = await computeChecksum(filePath);
    await fs.writeFile(filePath, Buffer.concat([DUMP_BYTES, Buffer.from("tampered")]));

    await expect(
      verifyBackupIntegrity(filePath, { expectedChecksum: checksum, execFileImpl: listImpl }),
    ).rejects.toThrow(/checksum mismatch/i);
    expect(listImpl).not.toHaveBeenCalled();
  });

  it("decrypts an encrypted archive into an isolated scratch file before restoring", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260101T000000Z.dump.enc");
    await fs.writeFile(filePath, encryptBuffer(DUMP_BYTES, KEY));
    const checksum = await computeChecksum(filePath);

    const result = await verifyBackupIntegrity(filePath, {
      expectedChecksum: checksum,
      encryptionKey: KEY,
      execFileImpl: listImpl,
    });

    expect(result.restoreOk).toBe(true);
    // The drill restores from a temp copy, never the encrypted file itself.
    const restoredArg = listImpl.mock.calls[0][1][1];
    expect(restoredArg).not.toBe(filePath);
    await expect(fs.access(restoredArg)).rejects.toThrow(); // scratch cleaned up
  });

  it("fails the drill for an encrypted archive when the key is wrong (key-rotation guard)", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260101T000000Z.dump.enc");
    await fs.writeFile(filePath, encryptBuffer(DUMP_BYTES, KEY));

    await expect(
      verifyBackupIntegrity(filePath, {
        encryptionKey: "b".repeat(64),
        execFileImpl: listImpl,
      }),
    ).rejects.toThrow();
  });

  it("runRestoreDrill drills the newest backup and records age/result metrics", async () => {
    const filename = "taggedpay_20260101T000000Z.dump";
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, DUMP_BYTES);
    const checksum = await computeChecksum(filePath);
    await writeBackupMetadata(tempDir, {
      filename,
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      sizeBytes: DUMP_BYTES.length,
      verified: true,
      checksum,
    });

    const result = await runRestoreDrill(
      { backupDir: tempDir, encryptionKey: null, pgRestorePath: "pg_restore" },
      { execFileImpl: listImpl },
    );

    expect(result).toMatchObject({ filename, ok: true, checksumOk: true, restoreOk: true });
    expect(result.backupAgeMs).toBeGreaterThanOrEqual(3_600_000 - 5000);

    const persisted = await readRestoreDrill(tempDir);
    expect(persisted).toMatchObject({ filename, ok: true });
    expect(persisted.ageMs).toBeGreaterThanOrEqual(0);
  });

  it("runRestoreDrill reports a failure result (not a throw) for a corrupted backup", async () => {
    const filename = "taggedpay_20260101T000000Z.dump";
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, DUMP_BYTES);
    await writeBackupMetadata(tempDir, {
      filename,
      createdAt: new Date().toISOString(),
      sizeBytes: DUMP_BYTES.length,
      verified: true,
      checksum: "0".repeat(64), // deliberately wrong
    });

    const result = await runRestoreDrill(
      { backupDir: tempDir, encryptionKey: null, pgRestorePath: "pg_restore" },
      { execFileImpl: listImpl },
    );

    expect(result.ok).toBe(false);
    expect(result.checksumOk).toBe(false);
    expect(result.error).toMatch(/checksum mismatch/i);
  });

  it("runRestoreDrill handles an empty backup set", async () => {
    const result = await runRestoreDrill(
      { backupDir: tempDir, encryptionKey: null, pgRestorePath: "pg_restore" },
      { execFileImpl: listImpl, persist: false },
    );

    expect(result).toMatchObject({ filename: null, ok: false });
    expect(result.error).toMatch(/no tracked backups/i);
  });

  it("readRestoreDrill returns null before any drill has run", async () => {
    expect(await readRestoreDrill(tempDir)).toBeNull();
  });

  it("recordRestoreDrill persists a normalized result", async () => {
    await recordRestoreDrill(tempDir, {
      filename: "x.dump",
      ok: true,
      checksumOk: true,
      restoreOk: true,
      backupAgeMs: 1000,
      durationMs: 42,
    });

    const read = await readRestoreDrill(tempDir);
    expect(read).toMatchObject({
      filename: "x.dump",
      ok: true,
      backupAgeMs: 1000,
      durationMs: 42,
    });
  });
});
