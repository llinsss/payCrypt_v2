import { resolveBackupConfig } from "../scripts/backup.js";
import { listBackupMetadata, readRestoreDrill } from "../utils/backupMetadata.js";

/**
 * Controller handling Admin visibility into automated database backups.
 */

export const listBackups = async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const parsedLimit = Math.min(Math.max(Number.parseInt(limit) || 30, 1), 100);

    const config = resolveBackupConfig();
    const [backups, restoreDrill] = await Promise.all([
      listBackupMetadata(config.backupDir, parsedLimit),
      readRestoreDrill(config.backupDir),
    ]);

    return res.status(200).json({
      success: true,
      data: backups,
      retentionDays: config.retentionDays,
      s3Enabled: Boolean(config.s3Bucket),
      restoreDrill,
    });
  } catch (error) {
    console.error("Failed to list backups:", error.message);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
