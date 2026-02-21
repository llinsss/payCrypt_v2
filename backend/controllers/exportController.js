import fs from "fs";
import path from "path";
import ExportService from "../services/ExportService.js";
import { exportQueue } from "../queues/export.js";

/**
 * Request a transaction export
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const requestExport = async (req, res) => {
  try {
    const { format, ...filters } = req.body;
    const userId = req.user.id;

    // Validate format
    if (!["csv", "pdf"].includes(format)) {
      return res
        .status(400)
        .json({ error: "Invalid format. Must be csv or pdf." });
    }

    // Check if this is a large export that should be queued
    const transactionCount = await getTransactionCount(userId, filters);

    if (transactionCount > 1000) {
      // Queue the export job
      const job = await exportQueue.add("export-transactions", {
        userId,
        format,
        filters,
        email: req.user.email,
      });

      return res.status(202).json({
        message: "Export request queued. You will receive an email when ready.",
        jobId: job.id,
        estimatedTime: "5-15 minutes depending on data size",
      });
    }

    // Generate export immediately for smaller datasets
    let filePath;
    if (format === "csv") {
      filePath = await ExportService.generateCSV(userId, filters);
    } else {
      filePath = await ExportService.generatePDF(userId, filters);
    }

    const fileName = path.basename(filePath);
    const fileSize = ExportService.getFileSize(filePath);

    res.json({
      message: "Export generated successfully",
      downloadUrl: `/api/exports/download/${fileName}`,
      fileSize: fileSize,
      expiresIn: "24 hours",
    });
  } catch (error) {
    console.error("Export request error:", error);
    res.status(500).json({ error: "Failed to process export request" });
  }
};

/**
 * Download an exported file
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const downloadExport = async (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(ExportService.exportsDir, fileName);

    // Security check: ensure file is in exports directory
    if (!filePath.startsWith(ExportService.exportsDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found or expired" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const extension = path.extname(fileName).toLowerCase();

    // Set appropriate headers
    const mimeType = extension === ".csv" ? "text/csv" : "application/pdf";
    const downloadName = `transaction_export_${Date.now()}${extension}`;

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`,
    );
    res.setHeader("Content-Length", fileSize);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Clean up file after download (optional - could be done via cron job)
    fileStream.on("end", () => {
      // Uncomment to delete after download
      // fs.unlinkSync(filePath);
    });
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Failed to download file" });
  }
};

/**
 * Get export job status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getExportStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await exportQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress();

    res.json({
      jobId,
      state,
      progress,
      data: job.data,
    });
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({ error: "Failed to get job status" });
  }
};

/**
 * Get estimated transaction count for export
 * @param {number} userId - User ID
 * @param {Object} filters - Filter options
 * @returns {number} Transaction count
 */
async function getTransactionCount(userId, filters = {}) {
  // This is a simplified count - in production you might want to implement
  // a more efficient count query in the Transaction model
  const transactions = await ExportService.getFilteredTransactions(userId, {
    ...filters,
    limit: 10001,
  });
  return transactions.length;
}
