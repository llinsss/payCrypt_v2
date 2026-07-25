import { promises as fs } from "node:fs";
import path from "node:path";

function metadataPath(backupDir, filename) {
  return path.join(backupDir, `${filename}.meta.json`);
}

/**
 * Records the outcome of a single backup run next to the dump file so the
 * admin API can report on recent backups without re-deriving state (e.g.
 * whether it reached S3) from the filesystem alone.
 */
export async function writeBackupMetadata(backupDir, record) {
  const file = metadataPath(backupDir, record.filename);
  const payload = {
    filename: record.filename,
    createdAt: record.createdAt,
    sizeBytes: record.sizeBytes,
    verified: Boolean(record.verified),
    encrypted: Boolean(record.encrypted),
    uploadedToS3: Boolean(record.uploadedToS3),
    s3Bucket: record.s3Bucket ?? null,
    s3Key: record.s3Key ?? null,
  };

  await fs.writeFile(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return payload;
}

export async function deleteBackupMetadata(backupDir, filename) {
  await fs.rm(metadataPath(backupDir, filename), { force: true });
}

/**
 * Lists the most recent backups (newest first) by reading their `.meta.json`
 * sidecar files. Backups created before this tracking existed simply won't
 * have a sidecar and are skipped.
 */
export async function listBackupMetadata(backupDir, limit = 50) {
  let entries;
  try {
    entries = await fs.readdir(backupDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".meta.json"))
      .map(async (entry) => {
        try {
          const raw = await fs.readFile(path.join(backupDir, entry.name), "utf8");
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }),
  );

  return records
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}
