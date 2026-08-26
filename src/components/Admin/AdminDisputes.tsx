import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../utils/api";

interface Dispute {
  id: number | string;
  reference?: string;
  status?: string;
  priority?: string;
  category?: string;
  subject?: string;
  description?: string;
  amount?: number | string;
  admin_notes?: string;
  user_id?: number | string;
  created_at?: string;
  [key: string]: unknown;
}

interface ListResponse {
  success?: boolean;
  data?: Dispute[];
  pagination?: { total?: number };
}

const statusColor = (status?: string) => {
  switch ((status || "").toLowerCase()) {
    case "resolved":
      return "text-emerald-600 bg-emerald-50";
    case "open":
    case "pending":
      return "text-amber-600 bg-amber-50";
    case "rejected":
      return "text-red-600 bg-red-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

const AdminDisputes: React.FC = () => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("resolved");
  const [refund, setRefund] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await apiClient.get<ListResponse>(`/admin/disputes${qs}`);
      setDisputes(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = (d: Dispute) => {
    setSelected(d);
    setNotes(typeof d.admin_notes === "string" ? d.admin_notes : "");
    setResolution(d.status === "resolved" ? "resolved" : "resolved");
    setRefund(false);
  };

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiClient.patch(`/admin/disputes/${selected.id}`, {
        status: resolution,
        admin_notes: notes,
        refund,
      });
      toast.success("Dispute updated");
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" /> Dispute Resolution
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Review disputes, add notes, and resolve with an optional refund.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>
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
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {disputes.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{d.reference ?? d.id}</td>
                <td className="px-4 py-3">{d.subject ?? d.category ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{d.priority ?? "—"}</td>
                <td className="px-4 py-3">{d.amount ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs ${statusColor(d.status)}`}>
                    {d.status ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openDetail(d)}
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
                  <Loader2 className="w-5 h-5 animate-spin inline" /> Loading disputes…
                </td>
              </tr>
            )}
            {!loading && disputes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No disputes found.
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
                  Dispute {selected.reference ?? selected.id}
                </h2>
                <p className="text-sm text-gray-500">{selected.category ?? ""}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selected.description && (
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                {selected.description}
              </p>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700">Admin notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="mt-1 w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                placeholder="Add internal notes about this dispute…"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                >
                  <option value="resolved">Resolve</option>
                  <option value="rejected">Reject</option>
                  <option value="pending">Keep pending</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                <input
                  type="checkbox"
                  checked={refund}
                  onChange={(e) => setRefund(e.target.checked)}
                />
                Trigger refund
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDisputes;
