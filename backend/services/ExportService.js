import db from "../config/database.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { generateCsv } from "./CsvGenerator.js";
import { generatePdf } from "./PdfGenerator.js";
import { signToken, verifyToken } from "../config/jwt.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { sendTemplatedEmail } from "./external/smtp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXPORT_THRESHOLD = 1000;
const EXPORT_EXPIRY_HOURS = 24;
const DOWNLOAD_TOKEN_EXPIRY = "24h";

function getExportStoragePath() {
  const base = process.env.EXPORT_STORAGE_PATH || path.join(__dirname, "../storage/exports");
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return base;
}

async function buildDownloadUrl(exportId, userId) {
  const baseUrl = process.env.API_BASE_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;
  const apiBase = baseUrl.replace(/\/$/, "");
  const token = signToken(
    { exportId, userId },
  const jti = randomUUID();
  const token = jwt.sign(
    { exportId, userId, jti },
    process.env.JWT_SECRET,
    { expiresIn: DOWNLOAD_TOKEN_EXPIRY }
  );
  // Persist jti so serveDownload can validate it (one-time use)
  await db("export_exports").where({ id: exportId }).update({ download_jti: jti });
  return `${apiBase}/api/transactions/export/download?token=${encodeURIComponent(token)}`;
}

export default {
  async createExport(userId, format, filters) {
    const validFormats = ["csv", "pdf"];
    if (!format || !validFormats.includes(format.toLowerCase())) {
      return { statusCode: 400, body: { error: "Invalid format. Use csv or pdf." } };
    }

    const fmt = format.toLowerCase();
    const transactions = await Transaction.getForExport(userId, filters);

    if (transactions.length > EXPORT_THRESHOLD) {
      const { exportQueue } = await import("../queues/exportQueue.js");
      if (exportQueue) {
        await exportQueue.add("export", {
          userId,
          format: fmt,
          filters,
          transactionCount: transactions.length,
        });
        return {
          statusCode: 202,
          body: {
            status: "queued",
            message: "Export queued. You will receive an email when ready.",
            recordCount: transactions.length,
          },
        };
      }
    }

    const metadata = {
      from: filters.from,
      to: filters.to,
      status: filters.status,
      chain: filters.chain,
      token: filters.token,
    };

    if (fmt === "csv") {
      const csv = generateCsv(transactions);
      const filename = `transactions-${Date.now()}.csv`;
      return {
        statusCode: 200,
        contentType: "text/csv",
        filename,
        data: csv,
      };
    }

    const storagePath = getExportStoragePath();
    const filename = `transactions-${Date.now()}.pdf`;
    const filePath = path.join(storagePath, filename);
    await generatePdf(transactions, metadata, filePath);
    const data = fs.readFileSync(filePath);
    fs.unlinkSync(filePath);
    return {
      statusCode: 200,
      contentType: "application/pdf",
      filename,
      data,
    };
  },

  async serveDownload(token) {
    try {
      const decoded = verifyToken(token);
      const { exportId, userId } = decoded;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { exportId, userId, jti } = decoded;

      // Require jti claim — tokens issued before this fix lack it
      if (!jti) {
        return { statusCode: 400, error: "Invalid download token." };
      }

      const exportRecord = await db("export_exports")
        .where({ id: exportId, user_id: userId })
        .first();

      if (!exportRecord) {
        return { statusCode: 404, error: "Export not found or expired." };
      }

      if (new Date(exportRecord.expires_at) < new Date()) {
        return { statusCode: 410, error: "Export has expired." };
      }

      // JTI validation — null means already used (one-time download)
      if (exportRecord.download_jti === null || exportRecord.download_jti !== jti) {
        return { statusCode: 410, error: "Download link has already been used." };
      }

      const filePath = exportRecord.file_path;

      // Path-traversal guard: restrict to the known export storage directory
      const storageDir = path.resolve(getExportStoragePath());
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(storageDir + path.sep)) {
        return { statusCode: 403, error: "Access denied." };
      }

      if (!fs.existsSync(resolvedPath)) {
        return { statusCode: 404, error: "Export file not found." };
      }

      // Invalidate the JTI so this link cannot be reused
      await db("export_exports").where({ id: exportId }).update({ download_jti: null });

      const ext = path.extname(resolvedPath);
      const contentType = ext === ".csv" ? "text/csv" : "application/pdf";
      const filename = `transactions-export${ext}`;

      return {
        statusCode: 200,
        filePath: resolvedPath,
        contentType,
        filename,
      };
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return { statusCode: 410, error: "Download link has expired." };
      }
      if (err.name === "JsonWebTokenError") {
        return { statusCode: 400, error: "Invalid download token." };
      }
      throw err;
    }
  },

  async processQueuedExport(job) {
    const { userId, format, filters } = job.data;
    const transactions = await Transaction.getForExport(userId, filters);

    const metadata = {
      from: filters.from,
      to: filters.to,
      status: filters.status,
      chain: filters.chain,
      token: filters.token,
    };

    const storagePath = getExportStoragePath();
    const filename = `transactions-${userId}-${Date.now()}.${format}`;
    const filePath = path.join(storagePath, filename);

    if (format === "csv") {
      const csv = generateCsv(transactions);
      fs.writeFileSync(filePath, csv);
    } else {
      await generatePdf(transactions, metadata, filePath);
    }

    const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000);
    const [exportRecord] = await db("export_exports")
      .insert({
        user_id: userId,
        file_path: filePath,
        format,
        filters: metadata,
        expires_at: expiresAt,
      })
      .returning("*");

    const user = await User.findById(userId);
    if (user?.email) {
      const downloadUrl = buildDownloadUrl(exportRecord.id, userId);
      await sendTemplatedEmail(
        user.email,
        "transaction_export_ready",
        {
          name: user.tag || user.email?.split("@")[0] || "User",
          downloadUrl,
          recordCount: transactions.length,
          format: format.toUpperCase(),
          expiresAt: expiresAt.toISOString().split("T")[0],
        }
      );
    }

    return { exportId: exportRecord.id, recordCount: transactions.length };
  },

  async cleanupExpiredExports() {
    const expired = await db("export_exports").where("expires_at", "<", new Date()).select("id", "file_path");
    let deleted = 0;
    for (const row of expired) {
      try {
        if (fs.existsSync(row.file_path)) {
          fs.unlinkSync(row.file_path);
        }
      } catch {
        /* ignore */
      }
      await db("export_exports").where({ id: row.id }).del();
      deleted++;
    }
    return deleted;
  },
};
