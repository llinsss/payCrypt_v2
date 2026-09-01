import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  writeBackupMetadata,
  deleteBackupMetadata,
  listBackupMetadata,
} from "../utils/backupMetadata.js";

describe("backupMetadata", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paycrypt-backup-meta-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("writes and lists backup metadata, newest first", async () => {
    await writeBackupMetadata(tempDir, {
      filename: "taggedpay_20260101T000000Z.dump.enc",
      createdAt: "2026-01-01T00:00:00.000Z",
      sizeBytes: 100,
      verified: true,
      encrypted: true,
      uploadedToS3: true,
      s3Bucket: "bucket",
      s3Key: "database-backups/taggedpay_20260101T000000Z.dump.enc",
    });
    await writeBackupMetadata(tempDir, {
      filename: "taggedpay_20260201T000000Z.dump.enc",
      createdAt: "2026-02-01T00:00:00.000Z",
      sizeBytes: 200,
      verified: true,
      encrypted: true,
      uploadedToS3: false,
    });

    const list = await listBackupMetadata(tempDir, 10);

    expect(list).toHaveLength(2);
    expect(list[0].filename).toBe("taggedpay_20260201T000000Z.dump.enc");
    expect(list[1].filename).toBe("taggedpay_20260101T000000Z.dump.enc");
    expect(list[0].uploadedToS3).toBe(false);
    expect(list[1].uploadedToS3).toBe(true);
  });

  it("respects the limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await writeBackupMetadata(tempDir, {
        filename: `taggedpay_2026010${i}T000000Z.dump`,
        createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        sizeBytes: 1,
      });
    }

    const list = await listBackupMetadata(tempDir, 2);
    expect(list).toHaveLength(2);
  });

  it("returns an empty list when the backup directory does not exist", async () => {
    const list = await listBackupMetadata(path.join(tempDir, "does-not-exist"), 10);
    expect(list).toEqual([]);
  });

  it("deletes metadata without throwing if the file is already gone", async () => {
    await expect(deleteBackupMetadata(tempDir, "nonexistent.dump")).resolves.toBeUndefined();
  });

  it("removes metadata after deletion", async () => {
    await writeBackupMetadata(tempDir, {
      filename: "taggedpay_20260301T000000Z.dump",
      createdAt: "2026-03-01T00:00:00.000Z",
      sizeBytes: 1,
    });

    await deleteBackupMetadata(tempDir, "taggedpay_20260301T000000Z.dump");

    const list = await listBackupMetadata(tempDir, 10);
    expect(list).toHaveLength(0);
  });
});
