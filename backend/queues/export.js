import path from "path";
import { Queue } from "bullmq";
import queueConfig from "./index.js";
import ExportService from "../services/ExportService.js";
import NotificationService from "../services/NotificationService.js";

export const exportQueue = queueConfig
  ? new Queue("export", queueConfig)
  : null;

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
  const { userId, format, filters, email } = job.data;

  try {
    console.log(`Starting export job ${job.id} for user ${userId}`);

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
      await sendExportNotification(email, format, downloadUrl);
    }

    console.log(`Export job ${job.id} completed. File: ${fileName}`);

    return {
      success: true,
      fileName,
      downloadUrl,
      fileSize: ExportService.getFileSize(filePath),
    };
  } catch (error) {
    console.error(`Export job ${job.id} failed:`, error);
    throw error;
  }
};

/**
 * Send email notification for completed export
 * @param {string} email - User email
 * @param {string} format - Export format (csv/pdf)
 * @param {string} downloadUrl - Download URL
 */
async function sendExportNotification(email, format, downloadUrl) {
  try {
    // For now, we'll use a simple console log
    // In production, integrate with your email service (SendGrid, AWS SES, etc.)
    console.log(`📧 Export ready notification:`);
    console.log(`To: ${email}`);
    console.log(`Subject: Your transaction export is ready`);
    console.log(
      `Message: Your ${format.toUpperCase()} export is ready for download: ${downloadUrl}`,
    );
    console.log(`Note: This link will expire in 24 hours.`);

    // TODO: Replace with actual email service
    // Example with nodemailer:
    // const transporter = nodemailer.createTransporter({...});
    // await transporter.sendMail({
    //   from: 'noreply@yourapp.com',
    //   to: email,
    //   subject: 'Your transaction export is ready',
    //   html: `<p>Your ${format.toUpperCase()} export is ready for download.</p>
    //          <p><a href="${downloadUrl}">Download here</a></p>
    //          <p>This link will expire in 24 hours.</p>`
    // });
  } catch (error) {
    console.error("Failed to send export notification:", error);
  }
}
