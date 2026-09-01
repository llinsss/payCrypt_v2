import React, { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Loader2, X, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../utils/api";

interface KycRecord {
  id: number | string;
  user_id?: number | string;
  status?: string;
  document_type?: string;
  document_url?: string;
  full_name?: string;
  country?: string;
  created_at?: string;
  [key: string]: unknown;
}

const statusColor = (status?: string) => {
  switch ((status || "").toLowerCase()) {
    case "verified":
    case "approved":
      return "text-emerald-600 bg-emerald-50";
    case "pending":
      return "text-amber-600 bg-amber-50";
    case "rejected":
      return "text-red-600 bg-red-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

const AdminKyc: React.FC = () => {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KycRecord | null>(null);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<KycRecord[] | { data?: KycRecord[] }>(
        "/kycs/admin/all",
      );
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setRecords(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load KYC submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (record: KycRecord, action: "approve" | "reject") => {
    if (action === "reject" && !reason.trim()) {
      toast.error("A reason is required to reject");
      return;
    }
    setActing(true);
    try {
      await apiClient.post(`/kycs/${record.id}/${action}`, {
        reason: reason.trim() || undefined,
      });
      toast.success(`KYC ${action === "approve" ? "approved" : "rejected"}`);
      setSelected(null);
      setReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" /> KYC Review Queue
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Review submitted documents and approve or reject with a reason.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{r.full_name ?? `#${r.user_id ?? r.id}`}</td>
                <td className="px-4 py-3 capitalize">{r.document_type ?? "—"}</td>
                <td className="px-4 py-3">{r.country ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs ${statusColor(r.status)}`}>
                    {r.status ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      setSelected(r);
                      setReason("");
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin inline" /> Loading submissions…
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No KYC submissions in the queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selected.full_name ?? `User #${selected.user_id ?? selected.id}`}
                </h2>
                <p className="text-sm text-gray-500 capitalize">
                  {selected.document_type ?? "document"} · {selected.country ?? "—"}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selected.document_url ? (
              <a
                href={selected.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <FileText className="w-4 h-4" /> View submitted document
              </a>
            ) : (
              <p className="text-sm text-gray-400 flex items-center gap-2">
                <FileText className="w-4 h-4" /> No document URL provided
              </p>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700">
                Reason (required to reject)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1 w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                placeholder="e.g. Document is blurry / name mismatch…"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => act(selected, "reject")}
                disabled={acting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {acting && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject
              </button>
              <button
                onClick={() => act(selected, "approve")}
                disabled={acting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {acting && <Loader2 className="w-4 h-4 animate-spin" />}
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminKyc;
