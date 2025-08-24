import React, { useEffect, useState, useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatCurrency } from "../../utils/amount";
import { DashboardSummary, UserTokenBalance } from "../../interfaces";
import { apiClient } from "../../utils/api";

const BalancesView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [balances, setBalances] = useState<UserTokenBalance[]>([]);
  const [hideBalances, setHideBalances] = useState(false);
  const [selectedChain, setSelectedChain] = useState("all");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summaryRes, balancesRes] = await Promise.all([
          apiClient.get<DashboardSummary>("/users/dashboard-summary"),
          apiClient.get<UserTokenBalance[]>("/balances"),
        ]);

        setSummary(summaryRes || null);
        setBalances(balancesRes || []);
      } catch (error) {
        console.error("Error fetching balances data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 🧮 Derived values
  const chains = useMemo(
    () => ["all", ...new Set(balances.map((b) => b.token_name))],
    [balances]
  );

  const filteredBalances = useMemo(
    () =>
      selectedChain === "all"
        ? balances
        : balances.filter((b) => b.token_name === selectedChain),
    [balances, selectedChain]
  );

  // 🔒 Utility for hiding balances
  const masked = (value: string | number, mask = "••••••") =>
    hideBalances ? mask : value;

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Portfolio Overview</h3>
          <button
            type="button"
            onClick={() => setHideBalances((prev) => !prev)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {hideBalances ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-3xl font-bold mb-2">
              {masked(formatCurrency(loading ? 0 : summary?.total_balance))}
            </div>
          </div>

          <div className="mt-4 md:mt-0 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-blue-200">Total Deposited</div>
              <div className="font-semibold">
                {masked(
                  formatCurrency(loading ? 0 : summary?.total_deposit),
                  "••••••"
                )}
              </div>
            </div>
            <div>
              <div className="text-blue-200">Total Withdrawn</div>
              <div className="font-semibold">
                {masked(
                  formatCurrency(loading ? 0 : summary?.total_withdrawal),
                  "••••••"
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chain Filter */}
      <div className="flex flex-wrap gap-2">
        {chains.map((chain) => (
          <button
            type="button"
            key={chain}
            onClick={() => setSelectedChain(chain)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedChain === chain
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {chain === "all"
              ? "All Chains"
              : chain.charAt(0).toUpperCase() + chain.slice(1)}
          </button>
        ))}
      </div>

      {/* Asset Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBalances.map((balance) => (
          <div
            key={balance.id}
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {balance.token_symbol.slice(0, 2)}
                </span>
              </div>
              <div>
                <div className="font-semibold text-gray-900">
                  {balance.token_symbol}
                </div>
                <div className="text-sm text-gray-500 capitalize">
                  {balance.token_name}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {masked(
                    balance.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {balance?.token_symbol}
                </div>
              </div>
              <div className="text-lg font-semibold text-gray-700">
                {masked(formatCurrency(Number(balance?.usd_value)), "••••••••")}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Current Price</span>
                <span className="font-medium">
                  {masked(formatCurrency(balance?.token_price || 0), "••••")}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Asset Allocation */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Asset Allocation
        </h3>
        <div className="space-y-4">
          {filteredBalances.map((balance) => {
            const percentage =
              summary?.total_balance && balance?.usd_value
                ? (balance.usd_value / summary.total_balance) * 100
                : 0;

            return (
              <div
                key={balance.id}
                className="flex items-center justify-between"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">
                      {balance.token_symbol[0]}
                    </span>
                  </div>
                  <span className="font-medium text-gray-900">
                    {balance.token_symbol}
                  </span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2 ml-4">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="font-semibold text-gray-900">
                    {percentage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    {masked(formatCurrency(balance?.usd_value), "••••••")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BalancesView;
