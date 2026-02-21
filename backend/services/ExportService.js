import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { createObjectCsvWriter } from "csv-writer";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import db from "../config/database.js";
import { getExplorerLink } from "../utils/explorer.js";

class ExportService {
  constructor() {
    this.exportsDir = path.join(process.cwd(), "exports");
    this.ensureExportsDir();
  }

  ensureExportsDir() {
    if (!fs.existsSync(this.exportsDir)) {
      fs.mkdirSync(this.exportsDir, { recursive: true });
    }
  }

  /**
   * Generate CSV export for transactions
   * @param {number} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {string} File path of the generated CSV
   */
  async generateCSV(userId, filters = {}) {
    const transactions = await this.getFilteredTransactions(userId, filters);

    const fileName = `transactions_${userId}_${Date.now()}.csv`;
    const filePath = path.join(this.exportsDir, fileName);

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "id", title: "Transaction ID" },
        { id: "created_at", title: "Date" },
        { id: "type", title: "Type" },
        { id: "amount", title: "Amount" },
        { id: "token_symbol", title: "Token" },
        { id: "status", title: "Status" },
        { id: "tx_hash", title: "Transaction Hash" },
        { id: "sender_address", title: "From" },
        { id: "recipient_address", title: "To" },
        { id: "notes", title: "Notes" },
        { id: "fee", title: "Fee" },
      ],
    });

    const records = transactions.map((tx) => ({
      id: tx.id,
      created_at: new Date(tx.created_at).toISOString().split("T")[0],
      type: tx.type,
      amount: tx.amount,
      token_symbol: tx.token_symbol || "XLM",
      status: tx.status,
      tx_hash: tx.tx_hash || "",
      sender_address: tx.sender_address || "",
      recipient_address: tx.recipient_address || "",
      notes: tx.notes || "",
      fee: tx.fee || "0",
    }));

    await csvWriter.writeRecords(records);
    return filePath;
  }

  /**
   * Generate PDF export for transactions
   * @param {number} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {string} File path of the generated PDF
   */
  async generatePDF(userId, filters = {}) {
    const transactions = await this.getFilteredTransactions(userId, filters);
    const user = await User.findById(userId);

    const fileName = `transactions_${userId}_${Date.now()}.pdf`;
    const filePath = path.join(this.exportsDir, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Header
    doc.fontSize(20).text("Transaction History Export", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Generated for: ${user.email}`, { align: "center" });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: "center" });
    doc.moveDown(2);

    // Table headers
    const headers = ["Date", "Type", "Amount", "Token", "Status", "Hash"];
    const columnWidths = [80, 60, 80, 50, 60, 150];
    let yPosition = doc.y;

    doc.fontSize(10);
    headers.forEach((header, index) => {
      doc.text(
        header,
        50 + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
        yPosition,
        {
          width: columnWidths[index],
          align: "left",
        },
      );
    });

    doc.moveDown();
    yPosition = doc.y;
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    doc.moveDown();

    // Table rows
    transactions.forEach((tx, index) => {
      if (doc.y > 700) {
        // New page if needed
        doc.addPage();
        yPosition = 50;
      }

      const rowData = [
        new Date(tx.created_at).toLocaleDateString(),
        tx.type,
        tx.amount.toString(),
        tx.token_symbol || "XLM",
        tx.status,
        tx.tx_hash ? tx.tx_hash.substring(0, 20) + "..." : "",
      ];

      yPosition = doc.y;
      rowData.forEach((data, colIndex) => {
        doc.text(
          data,
          50 + columnWidths.slice(0, colIndex).reduce((a, b) => a + b, 0),
          yPosition,
          {
            width: columnWidths[colIndex],
            align: "left",
          },
        );
      });

      doc.moveDown();
      yPosition = doc.y;
      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      doc.moveDown(0.5);
    });

    // Footer
    doc
      .fontSize(8)
      .text(
        `Total transactions: ${transactions.length}`,
        50,
        doc.page.height - 50,
      );

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    });
  }

  /**
   * Get filtered transactions for export
   * @param {number} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered transactions
   */
  async getFilteredTransactions(userId, filters = {}) {
    const {
      startDate,
      endDate,
      type,
      status,
      tokenId,
      minAmount,
      maxAmount,
      limit = 10000, // Default limit for exports
    } = filters;

    let query = db("transactions")
      .select(
        "transactions.*",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "chains.name as chain_name",
        "chains.symbol as chain_symbol",
        "chains.block_explorer as chain_explorer",
      )
      .leftJoin("users", "transactions.user_id", "users.id")
      .leftJoin("tokens", "transactions.token_id", "tokens.id")
      .leftJoin("chains", "transactions.chain_id", "chains.id")
      .where("transactions.user_id", userId)
      .where("transactions.deleted_at", null);

    // Apply date filters
    if (startDate) {
      query = query.where("transactions.created_at", ">=", new Date(startDate));
    }
    if (endDate) {
      query = query.where("transactions.created_at", "<=", new Date(endDate));
    }

    // Apply type filter
    if (type) {
      query = query.where("transactions.type", type);
    }

    // Apply status filter
    if (status) {
      query = query.where("transactions.status", status);
    }

    // Apply token filter
    if (tokenId) {
      query = query.where("transactions.token_id", tokenId);
    }

    // Apply amount filters (using usd_value as in the existing codebase)
    if (minAmount !== undefined && minAmount !== null) {
      query = query.where(
        "transactions.usd_value",
        ">=",
        parseFloat(minAmount),
      );
    }
    if (maxAmount !== undefined && maxAmount !== null) {
      query = query.where(
        "transactions.usd_value",
        "<=",
        parseFloat(maxAmount),
      );
    }

    const transactions = await query
      .limit(limit)
      .orderBy("transactions.created_at", "desc");

    return transactions.map((tx) => ({
      ...tx,
      explorer_link: getExplorerLink(
        tx.chain_name,
        tx.tx_hash,
        tx.chain_explorer,
      ),
    }));
  }

  /**
   * Clean up old export files
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
   */
  async cleanupOldExports(maxAge = 24 * 60 * 60 * 1000) {
    const files = fs.readdirSync(this.exportsDir);
    const now = Date.now();

    files.forEach((file) => {
      const filePath = path.join(this.exportsDir, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
      }
    });
  }

  /**
   * Get file size for a given file path
   * @param {string} filePath - File path
   * @returns {number} File size in bytes
   */
  getFileSize(filePath) {
    return fs.statSync(filePath).size;
  }
}

export default new ExportService();
