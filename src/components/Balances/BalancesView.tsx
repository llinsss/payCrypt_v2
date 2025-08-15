import React, { useEffect, useState } from "react";
import { Eye, EyeOff, TrendingUp, TrendingDown } from "lucide-react";
import {
  mockBalances,
  mockTokens,
  formatCurrency,
  formatCrypto,
} from "../../utils/mockData";
import { DashboardSummary, UserTokenBalance } from "../../interfaces";
import { apiClient } from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";

const BalancesView: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [balances, setBalances] = useState<UserTokenBalance[] | []>([]);
  const [hideBalances, setHideBalances] = useState(false);
  const [selectedChain, setSelectedChain] = useState("all");

  const filteredBalances =
    selectedChain === "all"
      ? balances
      : balances.filter((balance) => balance.token_name === selectedChain);

  const chains = ["all", ...new Set(balances.map((b) => b.token_name))];

  useEffect(() => {
    const fetchDashboardSummary = async () => {
      try {
        const data = await apiClient.get<DashboardSummary>(
          "/users/dashboard-summary"
        );
        setSummary(data);
      } catch (error) {
        console.error("Error fetching dashboard summary:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardSummary();
  }, []);

  useEffect(() => {
    const fetchUserTokenBalance = async () => {
      try {
        const data = await apiClient.get<UserTokenBalance[]>("/balances");
        setBalances(data);
      } catch (error) {
        console.error("Error fetching balances:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserTokenBalance();
  }, []);

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Portfolio Overview</h3>
          <button
            type="button"
            onClick={() => setHideBalances(!hideBalances)}
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
              {hideBalances
                ? "••••••••"
                : formatCurrency(loading ? 0 : summary?.total_balance)}
            </div>
            {/* <div className="flex items-center space-x-2 text-blue-100">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">+12.5% (24h)</span>
            </div> */}
          </div>

          <div className="mt-4 md:mt-0 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-blue-200">Total Deposited</div>
              <div className="font-semibold">
                {hideBalances
                  ? "••••••"
                  : formatCurrency(loading ? 0 : summary?.total_deposit)}
              </div>
            </div>
            <div>
              <div className="text-blue-200">Total Withdrawn</div>
              <div className="font-semibold">
                {hideBalances
                  ? "••••••"
                  : formatCurrency(loading ? 0 : summary?.total_withdrawal)}
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
        {filteredBalances.map((balance, index) => {
          const token = mockTokens.find(
            (t) => t.symbol === balance.token_symbol
          );

          return (
            <div
              key={index}
              className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
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
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {hideBalances
                      ? "••••••"
                      : balance.amount.toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}
                  </div>
                  <div className="text-sm text-gray-500">{balance.symbol}</div>
                </div>
                <div className="text-lg font-semibold text-gray-700">
                  {hideBalances
                    ? "••••••••"
                    : formatCurrency(balance.usd_value)}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Current Price</span>
                  <span className="font-medium">
                    {hideBalances
                      ? "••••"
                      : formatCurrency(balance?.token_price || 0)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Asset Allocation */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Asset Allocation
        </h3>
        <div className="space-y-4">
          {filteredBalances.map((balance, index) => {
            const percentage =
              summary?.total_balance > 0 && balance.usd_value > 0
                ? (balance.usd_value / summary?.total_balance) * 100
                : 0;
            return (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">
                      {balance.token_symbol.slice(0, 1)}
                    </span>
                  </div>
                  <span className="font-medium text-gray-900">
                    {balance.token_symbol}
                  </span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2 ml-4">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="font-semibold text-gray-900">
                    {percentage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    {hideBalances
                      ? "••••••"
                      : formatCurrency(balance.usd_value)}
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
