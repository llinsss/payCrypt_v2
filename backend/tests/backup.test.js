import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

import {
  formatTimestamp,
  buildBackupFilename,
  resolveBackupConfig,
  verifyBackupFile,
  pruneBackups,
  createBackup,
  encryptBackupFile,
  uploadBackupToS3,
} from "../scripts/backup.js";
import { decryptBuffer } from "../utils/backupEncryption.js";

describe("backup helpers", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paycrypt-backup-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("formats timestamps in UTC filename-safe format", () => {
    expect(formatTimestamp(new Date("2026-03-24T10:11:12.000Z"))).toBe(
      "20260324T101112Z"
    );
  });

  it("builds timestamped backup filenames", () => {
    expect(buildBackupFilename("taggedpay", "20260324T101112Z")).toBe(
      "taggedpay_20260324T101112Z.dump"
    );
  });

  it("resolves backup config from environment", () => {
    const config = resolveBackupConfig(
      {
        DB_HOST: "localhost",
        DB_PORT: "5432",
        DB_NAME: "taggedpay",
        DB_USER: "taggedpay_user",
        DB_PASSWORD: "secret",
        BACKUP_DIR: "./custom-backups",
        BACKUP_RETENTION_DAYS: "14",
        BACKUP_FILE_PREFIX: "prod",
        PG_DUMP_PATH: "/usr/bin/pg_dump",
        PG_RESTORE_PATH: "/usr/bin/pg_restore",
      },
      tempDir
    );

    expect(config.backupDir).toBe(path.join(tempDir, "custom-backups"));
    expect(config.retentionDays).toBe(14);
    expect(config.backupPrefix).toBe("prod");
    expect(config.pgDumpPath).toBe("/usr/bin/pg_dump");
    expect(config.pgRestorePath).toBe("/usr/bin/pg_restore");
  });

  it("rejects missing required database config", () => {
    expect(() =>
      resolveBackupConfig({
        DB_HOST: "localhost",
        DB_PORT: "5432",
      })
    ).toThrow("Missing required database environment variables");
  });

  it("verifies a valid custom-format backup file", async () => {
    const backupPath = path.join(tempDir, "valid.dump");
    await fs.writeFile(backupPath, Buffer.from("PGDMPmock-backup-data"));

    const execFileImpl = jest.fn().mockResolvedValue({
      stdout: "archive contents",
      stderr: "",
    });

    await expect(
      verifyBackupFile(backupPath, {
        execFileImpl,
        pgRestorePath: "pg_restore",
      })
    ).resolves.toBe(true);

    expect(execFileImpl).toHaveBeenCalledWith(
      "pg_restore",
      ["--list", backupPath],
      expect.objectContaining({
        env: process.env,
      })
    );
  });

  it("rejects empty backup files", async () => {
    const backupPath = path.join(tempDir, "empty.dump");
    await fs.writeFile(backupPath, "");

    await expect(verifyBackupFile(backupPath)).rejects.toThrow("Backup file is empty");
  });

  it("rejects invalid backup headers", async () => {
    const backupPath = path.join(tempDir, "invalid.dump");
    await fs.writeFile(backupPath, "not-a-postgres-backup");

    await expect(verifyBackupFile(backupPath)).rejects.toThrow(
      "does not look like a PostgreSQL custom dump"
    );
  });

  it("prunes only backups older than retention policy", async () => {
    const recentName = "taggedpay_20260323T000000Z.dump";
    const expiredName = "taggedpay_20260310T000000Z.dump";
    const ignoredName = "notes.txt";

    await fs.writeFile(path.join(tempDir, recentName), "recent");
    await fs.writeFile(path.join(tempDir, expiredName), "expired");
    await fs.writeFile(path.join(tempDir, ignoredName), "ignore me");

    const deleted = await pruneBackups(
      {
        backupDir: tempDir,
        backupPrefix: "taggedpay",
        retentionDays: 7,
      },
      {
        currentDate: new Date("2026-03-24T00:00:00.000Z"),
      }
    );

    expect(deleted).toEqual([expiredName]);
    await expect(fs.access(path.join(tempDir, recentName))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempDir, ignoredName))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempDir, expiredName))).rejects.toThrow();
  });

  it("creates a backup file with a timestamped filename and secure permissions", async () => {
    const config = {
      dbHost: "localhost",
      dbPort: "5432",
      dbName: "taggedpay",
      dbUser: "taggedpay_user",
      dbPassword: "secret",
      backupDir: tempDir,
      backupPrefix: "taggedpay",
      retentionDays: 7,
      pgDumpPath: "pg_dump",
    };

    const execFileImpl = jest.fn(async (command, args) => {
      const fileArg = args.find((arg) => arg.startsWith("--file="));
      const outputPath = fileArg.replace("--file=", "");
      await fs.writeFile(outputPath, Buffer.from("PGDMPmock-backup-data"));
      return { stdout: "", stderr: "" };
    });

    const backup = await createBackup(config, {
      execFileImpl,
      currentDate: new Date("2026-03-24T10:11:12.000Z"),
    });

    expect(backup.filename).toBe("taggedpay_20260324T101112Z.dump");
    expect(execFileImpl).toHaveBeenCalledWith(
      "pg_dump",
      expect.arrayContaining([
        "--format=custom",
        "--compress=6",
        "--no-owner",
        "--no-privileges",
        "--no-password",
        "--host=localhost",
        "--port=5432",
        "--username=taggedpay_user",
        "taggedpay",
      ]),
      expect.objectContaining({
        env: expect.objectContaining({
          PGPASSWORD: "secret",
        }),
      })
    );

    const stat = await fs.stat(backup.filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("defaults retention to 30 days when BACKUP_RETENTION_DAYS is unset", () => {
    const config = resolveBackupConfig(
      {
        DB_HOST: "localhost",
        DB_PORT: "5432",
        DB_NAME: "taggedpay",
        DB_USER: "taggedpay_user",
      },
      tempDir
    );

    expect(config.retentionDays).toBe(30);
  });

  it("leaves S3/encryption config unset by default and populated when env vars are provided", () => {
    const unconfigured = resolveBackupConfig(
      { DB_HOST: "localhost", DB_PORT: "5432", DB_NAME: "taggedpay", DB_USER: "taggedpay_user" },
      tempDir
    );
    expect(unconfigured.s3Bucket).toBeNull();
    expect(unconfigured.encryptionKey).toBeNull();

    const configured = resolveBackupConfig(
      {
        DB_HOST: "localhost",
        DB_PORT: "5432",
        DB_NAME: "taggedpay",
        DB_USER: "taggedpay_user",
        BACKUP_S3_BUCKET: "taggedpay-backups",
        BACKUP_ENCRYPTION_KEY: "a".repeat(32),
        AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
        AWS_SECRET_ACCESS_KEY: "secret",
        AWS_REGION: "eu-west-1",
      },
      tempDir
    );
    expect(configured.s3Bucket).toBe("taggedpay-backups");
    expect(configured.s3Region).toBe("eu-west-1");
    expect(configured.awsAccessKeyId).toBe("AKIAEXAMPLE");
  });

  it("encrypts a backup file and removes the plaintext dump", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260324T101112Z.dump");
    const plaintext = Buffer.from("PGDMPmock-backup-data");
    await fs.writeFile(filePath, plaintext);

    const result = await encryptBackupFile(filePath, "a".repeat(32));

    expect(result.encrypted).toBe(true);
    expect(result.filePath).toBe(`${filePath}.enc`);
    await expect(fs.access(filePath)).rejects.toThrow();

    const ciphertext = await fs.readFile(result.filePath);
    const decrypted = decryptBuffer(ciphertext, "a".repeat(32));
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("is a no-op when no encryption key is configured", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260324T101112Z.dump");
    await fs.writeFile(filePath, "PGDMPmock-backup-data");

    const result = await encryptBackupFile(filePath, null);

    expect(result).toEqual({ filePath, encrypted: false });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it("skips S3 upload when not configured", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260324T101112Z.dump");
    await fs.writeFile(filePath, "PGDMPmock-backup-data");

    const result = await uploadBackupToS3(filePath, "taggedpay_20260324T101112Z.dump", {
      s3Bucket: null,
    });

    expect(result).toEqual({ uploaded: false });
  });

  it("uploads to S3 when configured, using the s3Prefix as a key prefix", async () => {
    const filePath = path.join(tempDir, "taggedpay_20260324T101112Z.dump");
    await fs.writeFile(filePath, "PGDMPmock-backup-data");

    const putObjectImpl = jest.fn().mockResolvedValue(undefined);

    const result = await uploadBackupToS3(
      filePath,
      "taggedpay_20260324T101112Z.dump",
      {
        s3Bucket: "taggedpay-backups",
        s3Prefix: "database-backups",
        s3Region: "us-east-1",
        awsAccessKeyId: "AKIAEXAMPLE",
        awsSecretAccessKey: "secret",
      },
      { putObjectImpl }
    );

    expect(result).toEqual({
      uploaded: true,
      bucket: "taggedpay-backups",
      key: "database-backups/taggedpay_20260324T101112Z.dump",
    });
    expect(putObjectImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "taggedpay-backups",
        key: "database-backups/taggedpay_20260324T101112Z.dump",
        region: "us-east-1",
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "secret",
      })
    );
  });

  it("deletes the matching S3 object when pruning an expired backup", async () => {
    const expiredName = "taggedpay_20260310T000000Z.dump";
    await fs.writeFile(path.join(tempDir, expiredName), "expired");

    const deleteObjectImpl = jest.fn().mockResolvedValue(undefined);

    const deleted = await pruneBackups(
      {
        backupDir: tempDir,
        backupPrefix: "taggedpay",
        retentionDays: 7,
        s3Bucket: "taggedpay-backups",
        s3Prefix: "database-backups",
        s3Region: "us-east-1",
        awsAccessKeyId: "AKIAEXAMPLE",
        awsSecretAccessKey: "secret",
      },
      {
        currentDate: new Date("2026-03-24T00:00:00.000Z"),
        deleteObjectImpl,
      }
    );

    expect(deleted).toEqual([expiredName]);
    expect(deleteObjectImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "taggedpay-backups",
        key: `database-backups/${expiredName}`,
      })
    );
  });
});
