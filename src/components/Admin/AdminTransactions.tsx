import React, { useState, useCallback } from "react";
import { Search, ArrowUpRight, ArrowDownLeft, Loader2 } from "lucide-react";
import { apiClient } from "../../utils/api";

interface TxRecord {
  id?: number | string;
  reference?: string;
  type?: string;
  status?: string;
  amount?: number | string;
  usd_value?: number | string;
  from_address?: string;
  to_address?: string;
  tx_hash?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface SearchResponse {
  data?: TxRecord[];
  pagination?: { total?: number; hasMore?: boolean };
}

const statusColor = (status?: string) => {
  switch ((status || "").toLowerCase()) {
    case "completed":
      return "text-emerald-600 bg-emerald-50";
    case "pending":
      return "text-amber-600 bg-amber-50";
    case "failed":
      return "text-red-600 bg-red-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

const short = (v?: string, n = 10) =>
  v && v.length > n * 2 ? `${v.slice(0, n)}…${v.slice(-4)}` : v || "—";

const AdminTransactions: React.FC = () => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [rows, setRows] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      params.set("limit", "50");
      const res = await apiClient.get<SearchResponse>(
        `/transactions/search?${params.toString()}`,
      );
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, status, type]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Search className="w-6 h-6" /> Transaction Search
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Search transactions by reference, address, or hash.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="bg-white border rounded-xl p-4 flex flex-col sm:flex-row gap-3"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Reference, address, or tx hash…"
          className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All types</option>
          <option value="payment">Payment</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((tx, i) => (
              <tr key={tx.id ?? tx.reference ?? i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{tx.reference ?? tx.id}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-gray-700">
                    {tx.type === "credit" ? (
                      <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-gray-400" />
                    )}
                    {tx.type ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {tx.amount ?? "—"}
                  {tx.usd_value ? (
                    <span className="text-gray-400"> (${tx.usd_value})</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                  {short(tx.from_address)} → {short(tx.to_address)}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs ${statusColor(tx.status)}`}>
                    {tx.status ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {!loading && searched && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No transactions found.
                </td>
              </tr>
            )}
            {!searched && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  Enter a query above to search transactions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminTransactions;
