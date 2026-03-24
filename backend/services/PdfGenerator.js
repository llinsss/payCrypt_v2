import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

function formatDate(d) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split("T")[0];
}

export async function generatePdf(transactions, metadata, outputPath) {
  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  doc.fontSize(24).text("Tagged", { align: "center" });
  doc.fontSize(12).text("Transaction Export", { align: "center" });
  doc.moveDown(2);

  doc.fontSize(10).text(`Generated: ${formatDate(new Date())}`, { align: "left" });
  if (metadata.from || metadata.to) {
    doc.text(`Date range: ${metadata.from || "—"} to ${metadata.to || "—"}`);
  }
  if (metadata.status) doc.text(`Status filter: ${metadata.status}`);
  if (metadata.chain) doc.text(`Chain filter: ${metadata.chain}`);
  if (metadata.token) doc.text(`Token filter: ${metadata.token}`);
  doc.moveDown();

  const totalVolume = transactions.reduce((sum, tx) => sum + Number(tx.usd_value || 0), 0);
  doc.text(`Total transactions: ${transactions.length}`);
  doc.text(`Total volume (USD): ${totalVolume.toFixed(2)}`);
  doc.moveDown(2);

  const headers = ["Date", "ID", "Type", "Amount", "Token", "Chain", "Status", "Hash"];
  const colWidths = [70, 40, 55, 55, 45, 50, 50, 80];
  const startX = 50;
  let y = doc.y;

  doc.font("Helvetica-Bold").fontSize(8);
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: colWidths[i] });
    x += colWidths[i] + 5;
  });
  doc.font("Helvetica").moveDown(0.5);

  const pageHeight = 700;
  transactions.forEach((tx) => {
    if (y > pageHeight) {
      doc.addPage();
      y = 50;
    }

    y = doc.y;
    x = startX;
    const row = [
      formatDate(tx.created_at),
      String(tx.id),
      (tx.type || "").slice(0, 8),
      String(tx.amount ?? "").slice(0, 10),
      (tx.token_symbol || tx.token_name || "").slice(0, 6),
      (tx.chain_name || tx.chain_symbol || "").slice(0, 8),
      (tx.status || "").slice(0, 8),
      (tx.tx_hash || "").slice(0, 12),
    ];
    row.forEach((val, i) => {
      doc.text(val, x, y, { width: colWidths[i], overflow: "ellipsis" });
      x += colWidths[i] + 5;
    });
    doc.moveDown(0.3);
  });

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve(outputPath));
    writeStream.on("error", reject);
  });
}
