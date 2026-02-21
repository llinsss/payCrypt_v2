class ReceiptService {
  /**
   * Generates a PDF receipt buffer for a completed transaction.
   * @param {Object} transaction
   * @returns {Promise<Buffer>}
   */
  async generateReceipt(transaction) {
    const PDFDocument = await this.loadPdfKit();
    const QRCode = await this.loadQrCode();

    const id = transaction.id;
    const hash = transaction.tx_hash || transaction.reference || "N/A";
    const amount = transaction.amount ?? "N/A";
    const currency = transaction.token_symbol || "USD";
    const sender = transaction.from_address || transaction.user_tag || "N/A";
    const receiver = transaction.to_address || "N/A";
    const timestamp = transaction.timestamp || transaction.created_at;
    const status = transaction.status || "N/A";
    const fee = this.extractFee(transaction.extra, currency);

    const qrCodeDataUrl = await QRCode.toDataURL(String(hash), {
      errorCorrectionLevel: "H",
      width: 150,
    });

    const qrImageBuffer = Buffer.from(qrCodeDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      doc.fontSize(24).font("Helvetica-Bold").text("Transaction Receipt", { align: "center" });

      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("gray")
        .text(`Generated: ${new Date().toUTCString()}`, { align: "center" });

      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      doc.fillColor("black").fontSize(12).font("Helvetica-Bold").text("Transaction Details");
      doc.moveDown(0.5);

      const details = [
        ["Transaction ID", String(id ?? "N/A")],
        ["Transaction Hash", String(hash)],
        ["Status", String(status)],
        ["Amount", `${amount} ${currency}`],
        ["Fee", fee],
        ["Sender", String(sender)],
        ["Receiver", String(receiver)],
        ["Date & Time", this.formatDate(timestamp)],
      ];

      doc.font("Helvetica").fontSize(11).fillColor("black");
      details.forEach(([label, value]) => {
        doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
        doc.font("Helvetica").text(value || "N/A");
      });

      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      doc.fontSize(12).font("Helvetica-Bold").text("Verify Transaction", { align: "center" });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("gray")
        .text("Scan the QR code below to verify this transaction on-chain", { align: "center" });
      doc.moveDown(0.5);

      const qrX = (doc.page.width - 150) / 2;
      doc.image(qrImageBuffer, qrX, doc.y, { width: 150, height: 150 });

      doc.moveDown(8);
      doc
        .fontSize(8)
        .fillColor("gray")
        .text("This receipt was automatically generated. Keep it for your records.", {
          align: "center",
        });

      doc.end();
    });
  }

  async loadPdfKit() {
    try {
      const module = await import("pdfkit");
      return module.default || module;
    } catch {
      throw new Error("pdfkit dependency is not installed");
    }
  }

  async loadQrCode() {
    const module = await import("qrcode");
    return module.default || module;
  }

  extractFee(extra, currency) {
    if (!extra) {
      return "N/A";
    }

    try {
      const parsed = typeof extra === "string" ? JSON.parse(extra) : extra;
      if (parsed && parsed.fee !== undefined && parsed.fee !== null) {
        return `${parsed.fee} ${currency}`;
      }
    } catch {
      // Ignore non-JSON extra payloads and fall back to N/A.
    }

    return "N/A";
  }

  formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toUTCString();
  }
}

export default new ReceiptService();
