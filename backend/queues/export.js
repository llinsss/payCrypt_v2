import path from "path";
import { Queue } from "bullmq";
import queueConfig from "./index.js";
import ExportService from "../services/ExportService.js";
import NotificationService from "../services/NotificationService.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";

export const exportQueue = queueConfig
  ? new Queue("export", queueConfig)
  : null;
attachRedisErrorAlert(exportQueue, "export-queue");

if (exportQueue) {
  exportQueue.on("waiting", (job) =>
    console.log(`⏳ Export Job ${JSON.stringify(job)} waiting in queue`),
  );
  exportQueue.on("active", (job) =>
    console.log(`⚙️ Export Processing job ${job.id}`),
  );
  exportQueue.on("failed", (job, err) =>
    console.error(`💥 Export Job ${job.id} failed:`, err.message),
  );
  exportQueue.on("completed", (job) =>
    console.log(`✅ Export Job ${job.id} completed successfully`),
  );
} else {
  console.warn("⚠️ Export queue not available (Redis not connected)");
}

// Worker function to process export jobs
export const processExportJob = async (job) => {
  const { userId, format, filters, email, transactionCount } = job.data;

  try {
    logger.info({
      msg: `Starting export job ${job.id}`,
      userId,
      format,
      recordCount: transactionCount,
    });

    let filePath;
    if (format === "csv") {
      filePath = await ExportService.generateCSV(userId, filters);
    } else {
      filePath = await ExportService.generatePDF(userId, filters);
    }

    const fileName = path.basename(filePath);
    const downloadUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/exports/download/${fileName}`;

    // Send email notification with download link
    if (email) {
      await sendExportNotification(email, format, downloadUrl, transactionCount);
    }

    logger.info({
      msg: `Export job completed successfully`,
      jobId: job.id,
      fileName,
    });

    return {
      success: true,
      fileName,
      downloadUrl,
      fileSize: ExportService.getFileSize(filePath),
    };
  } catch (error) {
    logger.error({
      msg: `Export job failed`,
      jobId: job.id,
      userId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Send email notification for completed export
 * @param {string} email - User email
 * @param {string} format - Export format (csv/pdf)
 * @param {string} downloadUrl - Download URL
 * @param {number} recordCount - Number of records exported
 */
async function sendExportNotification(email, format, downloadUrl, recordCount) {
  try {
    const user = await db("users").where({ email }).first();
    if (!user) {
      logger.warn(`User not found for email: ${email}`);
      return false;
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString();

    const info = await sendTemplatedEmail(
      email,
      "transaction_export_ready",
      {
        name: user.name || user.username || "User",
        format: format.toUpperCase(),
        recordCount: recordCount || 0,
        downloadUrl,
        expiresAt,
      },
      "en"
    );

    if (info) {
      logger.info({
        msg: `Export email sent successfully`,
        email,
        format,
        messageId: info.messageId,
      });
      return true;
    } else {
      logger.error({
        msg: `Failed to send export email`,
        email,
        format,
      });
      return false;
    }
  } catch (error) {
    logger.error({
      msg: "Error sending export notification",
      email,
      error: error.message,
    });
    return false;
  }
}
