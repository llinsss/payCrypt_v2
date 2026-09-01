import React, { useEffect, useState, useCallback } from "react";
import { Activity, Database, Server, Zap, RefreshCcw } from "lucide-react";
import { apiClient } from "../../utils/api";

interface HealthCheck {
  status?: string;
  latencyMs?: number;
  message?: string;
  pool?: Record<string, unknown>;
}

interface HealthResponse {
  status?: string;
  uptime?: number;
  timestamp?: string;
  version?: string;
  checks?: {
    database?: HealthCheck;
    redis?: HealthCheck;
    stellar?: HealthCheck;
    [key: string]: HealthCheck | undefined;
  };
}

const statusColor = (status?: string) => {
  switch ((status || "").toLowerCase()) {
    case "up":
    case "ok":
    case "ready":
      return "text-emerald-600 bg-emerald-50 border-emerald-200";
    case "down":
    case "error":
      return "text-red-600 bg-red-50 border-red-200";
    default:
      return "text-amber-600 bg-amber-50 border-amber-200";
  }
};

const formatUptime = (seconds?: number) => {
  if (!seconds && seconds !== 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
};

const AdminHealth: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<HealthResponse>("/health");
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000); // auto-refresh every 15s
    return () => clearInterval(id);
  }, [load]);

  const checks = health?.checks ?? {};
  const tiles = [
    { key: "database", label: "Database", icon: Database, check: checks.database },
    { key: "redis", label: "Redis", icon: Zap, check: checks.redis },
    { key: "stellar", label: "Stellar Horizon", icon: Server, check: checks.stellar },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6" /> System Health
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Live status of core dependencies. Auto-refreshes every 15s.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-800"
        >
          <RefreshCcw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && !health ? (
        <div className="text-gray-500 py-12 text-center">Loading health…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border bg-white">
              <p className="text-xs text-gray-500 uppercase">Overall</p>
              <p
                className={`mt-2 inline-flex px-3 py-1 rounded-full text-sm border ${statusColor(
                  health?.status,
                )}`}
              >
                {health?.status ?? "unknown"}
              </p>
            </div>
            <div className="p-4 rounded-xl border bg-white">
              <p className="text-xs text-gray-500 uppercase">Uptime</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {formatUptime(health?.uptime)}
              </p>
            </div>
            <div className="p-4 rounded-xl border bg-white">
              <p className="text-xs text-gray-500 uppercase">Version</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {health?.version ?? "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tiles.map(({ key, label, icon: Icon, check }) => (
              <div key={key} className="p-5 rounded-xl border bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{label}</span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs border ${statusColor(
                      check?.status,
                    )}`}
                  >
                    {check?.status ?? "unknown"}
                  </span>
                </div>
                <dl className="mt-3 text-sm text-gray-500 space-y-1">
                  {typeof check?.latencyMs === "number" && (
                    <div className="flex justify-between">
                      <dt>Latency</dt>
                      <dd className="text-gray-900">{check.latencyMs} ms</dd>
                    </div>
                  )}
                  {check?.message && (
                    <div className="flex justify-between gap-4">
                      <dt>Message</dt>
                      <dd className="text-gray-900 truncate">{check.message}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>

          {health?.timestamp && (
            <p className="text-xs text-gray-400">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AdminHealth;
