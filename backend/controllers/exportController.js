import ExportService from "../services/ExportService.js";
import { exportQueue } from "../queues/exportQueue.js";

export const requestExport = async (req, res) => {
  req.query = { ...req.query, ...req.body };
  return exportTransactions(req, res);
};

export const getExportStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!exportQueue) {
      return res.status(503).json({ error: "Export queue unavailable" });
    }
    const job = await exportQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Export job not found" });
    }
    return res.json({
      id: job.id,
      status: await job.getState(),
      progress: job.progress,
      failedReason: job.failedReason || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const exportTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { format, from, to, status, chain, token } = req.query;
    const filters = { from, to, status, chain, token };

    const result = await ExportService.createExport(userId, format, filters);

    if (result.statusCode === 202) {
      return res.status(202).json(result.body);
    }

    if (result.statusCode === 400) {
      return res.status(400).json(result.body);
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.send(result.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const downloadExport = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: "Download token required" });
    }

    const result = await ExportService.serveDownload(token);
    if (result.error) {
      return res.status(result.statusCode).json({ error: result.error });
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.sendFile(result.filePath);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
