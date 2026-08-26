"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function DashboardPage() {
  const [balances, setBalances] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [balancesRes, transactionsRes] = await Promise.all([
          apiClient.getBalances(),
          apiClient.getTransactions(1, 30),
        ]);

        setBalances(balancesRes.data || []);

        if (transactionsRes.data) {
          const grouped = transactionsRes.data.reduce((acc: any, tx: any) => {
            const date = new Date(tx.created_at).toLocaleDateString();
            const existing = acc.find((item: any) => item.date === date);
            if (existing) {
              existing.volume += parseFloat(tx.amount || 0);
            } else {
              acc.push({ date, volume: parseFloat(tx.amount || 0) });
            }
            return acc;
          }, []);
          setChartData(grouped.slice(0, 7));
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <>
            {/* Balance Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {balances.map((balance) => (
                <div
                  key={balance.id}
                  className="bg-white p-6 rounded-lg shadow-md"
                >
                  <h3 className="text-sm font-medium text-gray-600">
                    {balance.token_symbol || "Token"}
                  </h3>
                  <p className="text-2xl font-bold mt-2">
                    {parseFloat(balance.amount).toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    ≈ ${(parseFloat(balance.amount) * (balance.token_price || 1)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Transaction Volume Chart */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold mb-4">Transaction Volume</h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="volume" stroke="#3b82f6" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500">No transaction data available</p>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
