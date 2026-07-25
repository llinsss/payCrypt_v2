#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import dotenv from "dotenv";

import { encryptBuffer } from "../utils/backupEncryption.js";
import { putObject as putObjectToS3, deleteObject as deleteObjectFromS3 } from "../utils/s3Client.js";
import { writeBackupMetadata, deleteBackupMetadata } from "../utils/backupMetadata.js";

const DUMP_HEADER = "PGDMP";
const DEFAULT_BACKUP_PREFIX = "taggedpay";
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_BACKUP_DIR = "backups";
const DEFAULT_PG_DUMP_PATH = "pg_dump";
const DEFAULT_PG_RESTORE_PATH = "pg_restore";
const DEFAULT_S3_PREFIX = "database-backups";
const DEFAULT_AWS_REGION = "us-east-1";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);

export function formatTimestamp(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

export function buildBackupFilename(prefix, timestamp) {
  return `${prefix}_${timestamp}.dump`;
}

export function isBackupFilename(filename, prefix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapedPrefix}_(\\d{8}T\\d{6}Z)\\.dump(\\.enc)?$`).test(filename);
}

export function extractTimestampFromFilename(filename, prefix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = filename.match(
    new RegExp(`^${escapedPrefix}_(\\d{8}T\\d{6}Z)\\.dump(?:\\.enc)?$`)
  );
  return match ? match[1] : null;
}

export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveBackupConfig(env = process.env, cwd = process.cwd()) {
  const missingVars = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER"].filter(
    (key) => !env[key]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required database environment variables: ${missingVars.join(", ")}`
    );
  }

  return {
    dbHost: env.DB_HOST,
    dbPort: String(env.DB_PORT),
    dbName: env.DB_NAME,
    dbUser: env.DB_USER,
    dbPassword: env.DB_PASSWORD || "",
    backupDir: path.resolve(cwd, env.BACKUP_DIR || DEFAULT_BACKUP_DIR),
    backupPrefix: env.BACKUP_FILE_PREFIX || DEFAULT_BACKUP_PREFIX,
    retentionDays: parsePositiveInteger(
      env.BACKUP_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS
    ),
    pgDumpPath: env.PG_DUMP_PATH || DEFAULT_PG_DUMP_PATH,
    pgRestorePath: env.PG_RESTORE_PATH || DEFAULT_PG_RESTORE_PATH,
    scheduleCron: env.BACKUP_SCHEDULE_CRON || "0 2 * * *",
    encryptionKey: env.BACKUP_ENCRYPTION_KEY || null,
    s3Bucket: env.BACKUP_S3_BUCKET || null,
    s3Prefix: env.BACKUP_S3_PREFIX || DEFAULT_S3_PREFIX,
    s3Region: env.AWS_REGION || DEFAULT_AWS_REGION,
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID || null,
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY || null,
  };
}

function s3IsConfigured(config) {
  return Boolean(config.s3Bucket && config.awsAccessKeyId && config.awsSecretAccessKey);
}

function s3KeyFor(config, filename) {
  return `${config.s3Prefix}/${filename}`;
}

export async function ensureBackupDirectory(backupDir) {
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
  await fs.chmod(backupDir, 0o700);
}

export function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

export async function createBackup(config, options = {}) {
  const {
    execFileImpl = execFileAsync,
    currentDate = new Date(),
    outputDirMode = 0o700,
    outputFileMode = 0o600,
  } = options;

  const timestamp = formatTimestamp(currentDate);
  const filename = buildBackupFilename(config.backupPrefix, timestamp);
  const filePath = path.join(config.backupDir, filename);

  await fs.mkdir(config.backupDir, { recursive: true, mode: outputDirMode });
  await fs.chmod(config.backupDir, outputDirMode);

  const args = [
    "--format=custom",
    "--compress=6",
    "--no-owner",
    "--no-privileges",
    "--no-password",
    `--file=${filePath}`,
    `--host=${config.dbHost}`,
    `--port=${config.dbPort}`,
    `--username=${config.dbUser}`,
    config.dbName,
  ];

  await execFileImpl(config.pgDumpPath, args, {
    env: {
      ...process.env,
      PGPASSWORD: config.dbPassword,
    },
  });

  await fs.chmod(filePath, outputFileMode);

  return {
    filename,
    filePath,
    timestamp,
  };
}

export async function verifyBackupFile(filePath, options = {}) {
  const { execFileImpl = execFileAsync, pgRestorePath = DEFAULT_PG_RESTORE_PATH } =
    options;

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Backup path is not a file: ${filePath}`);
  }

  if (stat.size === 0) {
    throw new Error(`Backup file is empty: ${filePath}`);
  }

  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(DUMP_HEADER.length);
    await handle.read(buffer, 0, DUMP_HEADER.length, 0);

    if (buffer.toString("utf8") !== DUMP_HEADER) {
      throw new Error(`Backup file does not look like a PostgreSQL custom dump: ${filePath}`);
    }
  } finally {
    await handle.close();
  }

  await execFileImpl(pgRestorePath, ["--list", filePath], {
    env: process.env,
  });

  return true;
}

/**
 * Encrypts a verified dump with AES-256-GCM and replaces it on disk with the
 * `.enc` file (the plaintext dump is removed once the encrypted copy is
 * written). No-ops (returns the original path) if no encryption key is
 * configured.
 */
export async function encryptBackupFile(filePath, encryptionKey, options = {}) {
  const { outputFileMode = 0o600 } = options;

  if (!encryptionKey) {
    return { filePath, encrypted: false };
  }

  const plaintext = await fs.readFile(filePath);
  const ciphertext = encryptBuffer(plaintext, encryptionKey);

  const encryptedPath = `${filePath}.enc`;
  await fs.writeFile(encryptedPath, ciphertext, { mode: outputFileMode });
  await fs.rm(filePath, { force: true });

  return { filePath: encryptedPath, encrypted: true };
}

/**
 * Uploads a backup file to S3 if BACKUP_S3_BUCKET (and AWS credentials) are
 * configured. Returns { uploaded: false } otherwise so callers can treat S3
 * as an optional destination.
 */
export async function uploadBackupToS3(filePath, filename, config, options = {}) {
  const { putObjectImpl = putObjectToS3 } = options;

  if (!s3IsConfigured(config)) {
    return { uploaded: false };
  }

  const body = await fs.readFile(filePath);
  const key = s3KeyFor(config, filename);

  await putObjectImpl({
    bucket: config.s3Bucket,
    key,
    region: config.s3Region,
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
    body,
    contentType: "application/octet-stream",
  });

  return { uploaded: true, bucket: config.s3Bucket, key };
}

export async function pruneBackups(config, options = {}) {
  const { currentDate = new Date(), deleteObjectImpl = deleteObjectFromS3 } = options;
  const entries = await fs.readdir(config.backupDir, { withFileTypes: true });
  const cutoff = currentDate.getTime() - config.retentionDays * 24 * 60 * 60 * 1000;

  const backups = entries
    .filter((entry) => entry.isFile() && isBackupFilename(entry.name, config.backupPrefix))
    .map((entry) => {
      const timestamp = extractTimestampFromFilename(entry.name, config.backupPrefix);
      const parsed = timestamp
        ? Date.parse(
            `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}Z`
          )
        : Number.NaN;

      return {
        name: entry.name,
        filePath: path.join(config.backupDir, entry.name),
        createdAtMs: parsed,
      };
    })
    .filter((backup) => Number.isFinite(backup.createdAtMs))
    .sort((left, right) => left.createdAtMs - right.createdAtMs);

  const deleted = [];
  for (const backup of backups) {
    if (backup.createdAtMs >= cutoff) {
      continue;
    }

    await fs.unlink(backup.filePath);

    if (s3IsConfigured(config)) {
      await deleteObjectImpl({
        bucket: config.s3Bucket,
        key: s3KeyFor(config, backup.name),
        region: config.s3Region,
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      });
    }

    await deleteBackupMetadata(config.backupDir, backup.name);

    deleted.push(backup.name);
  }

  return deleted;
}

export async function runBackup(env = process.env) {
  const config = resolveBackupConfig(env);

  console.log(
    `Starting database backup for ${config.dbName} to ${config.backupDir} (retention ${config.retentionDays} day(s))`
  );

  await ensureBackupDirectory(config.backupDir);

  const backup = await createBackup(config);

  try {
    await verifyBackupFile(backup.filePath, {
      pgRestorePath: config.pgRestorePath,
    });
  } catch (error) {
    await fs.rm(backup.filePath, { force: true });
    throw new Error(`Backup verification failed: ${error.message}`);
  }

  const { filePath: finalFilePath, encrypted } = await encryptBackupFile(
    backup.filePath,
    config.encryptionKey
  );
  const finalFilename = path.basename(finalFilePath);

  const s3Result = await uploadBackupToS3(finalFilePath, finalFilename, config);

  const stat = await fs.stat(finalFilePath);
  await writeBackupMetadata(config.backupDir, {
    filename: finalFilename,
    createdAt: new Date().toISOString(),
    sizeBytes: stat.size,
    verified: true,
    encrypted,
    uploadedToS3: s3Result.uploaded,
    s3Bucket: s3Result.bucket ?? null,
    s3Key: s3Result.key ?? null,
  });

  const deletedBackups = await pruneBackups(config);

  console.log(`Backup created successfully: ${finalFilename}`);
  console.log(`Encrypted: ${encrypted ? "yes" : "no"}; Uploaded to S3: ${s3Result.uploaded ? "yes" : "no"}`);
  if (deletedBackups.length > 0) {
    console.log(`Pruned ${deletedBackups.length} expired backup(s)`);
  } else {
    console.log("No expired backups to prune");
  }
  console.log(
    `Daily scheduling support: ${config.scheduleCron} (configure this in your host cron)`
  );

  return {
    ...backup,
    filePath: finalFilePath,
    filename: finalFilename,
    encrypted,
    uploadedToS3: s3Result.uploaded,
    s3Bucket: s3Result.bucket ?? null,
    s3Key: s3Result.key ?? null,
    deletedBackups,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runBackup()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(`Database backup failed: ${error.message}`);
      process.exitCode = 1;
    });
}
