import { stringify } from "csv-stringify/sync";

const CSV_HEADERS = [
  "Date",
  "Transaction ID",
  "Type",
  "Amount",
  "Token",
  "Chain",
  "Status",
  "Hash",
  "Created At",
  "Blockchain Timestamp",
  "From Address",
  "To Address",
  "USD Value",
  "Reference",
  "Description",
  "Notes",
];

function formatDate(d) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split("T")[0];
}

export function generateCsv(transactions) {
  const rows = transactions.map((tx) => [
    formatDate(tx.created_at),
    tx.id,
    tx.type || "",
    String(tx.amount ?? ""),
    tx.token_symbol || tx.token_name || "",
    tx.chain_name || tx.chain_symbol || "",
    tx.status || "",
    tx.tx_hash || "",
    tx.created_at ? new Date(tx.created_at).toISOString() : "",
    tx.timestamp || "",
    tx.from_address || "",
    tx.to_address || "",
    String(tx.usd_value ?? ""),
    tx.reference || "",
    tx.description || "",
    tx.notes || "",
  ]);

  return stringify([CSV_HEADERS, ...rows]);
}
