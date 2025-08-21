import React, { useEffect, useState } from "react";
import { apiClient } from "../../utils/api";
import { formatCurrency } from "../../utils/amount";
import {
  ArrowRightLeft,
  Lock,
  Unlock,
  TrendingUp,
  TrendingDown,
  Settings,
} from "lucide-react";
import { mockBalances, formatCrypto } from "../../utils/mockData";
import { DashboardSummary, UserTokenBalance } from "../../interfaces";

const MultiCurrencyView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [balances, setBalances] = useState<UserTokenBalance[] | []>([]);
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

  const [autoConvert, setAutoConvert] = useState<{ [key: string]: boolean }>({
    ETH: false,
    USDC: true,
    STRK: false,
    CORE: false,
  });
  const handleAutoConvertToggle = (symbol: string) => {
    setAutoConvert((prev) => ({
      ...prev,
      [symbol]: !prev[symbol],
    }));
  };

  const handleThresholdChange = (symbol: string, value: number) => {
    setConversionThreshold((prev) => ({
      ...prev,
      [symbol]: value,
    }));
  };

  const handleQuickSwap = (fromSymbol: string, toSymbol: string) => {
    alert(`Swapping ${fromSymbol} to ${toSymbol}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Multi-Currency Management
        </h2>
        <p className="text-gray-600">
          Manage your crypto and fiat balances with auto-conversion
        </p>
      </div>

      {/* Portfolio Overview */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Total Portfolio Value</h3>
        <div className="text-3xl font-bold mb-2">
          {formatCurrency(loading ? 0 : summary?.total_balance)}
        </div>
      </div>

      {/* Currency Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {balances.map((balance, index) => {
          return (
            <div
              key={index}
              className="bg-white rounded-xl p-6 border border-gray-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-r from-blue-500 to-purple-500">
                    <span className="font-bold text-sm text-white">
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
                <button
                  type="button"
                  onClick={() => handleAutoConvertToggle(balance.token_symbol)}
                  className={`p-2 rounded-lg transition-colors ${
                    balance.auto_convert_threshold
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-gray-100 text-gray-600"
                  }`}
                  title={
                    balance.auto_convert_threshold
                      ? "Auto-convert enabled"
                      : "Auto-convert disabled"
                  }
                >
                  {balance.auto_convert_threshold ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="space-y-2 mb-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {balance.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                  </div>
                  <div className="text-sm text-gray-500">
                    {balance.token_symbol}
                  </div>
                </div>
                <div className="text-lg font-semibold text-gray-700">
                  {formatCurrency(balance.usd_value)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                {balance.chain !== "fiat" && (
                  <button
                    type="button"
                    onClick={() => handleQuickSwap(balance.symbol, "NGN")}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-2">
                  Auto-convert threshold:
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={balance.auto_convert_threshold || 0}
                    onChange={(e) =>
                      handleThresholdChange(
                        balance.token_symbol,
                        Number.parseFloat(e.target.value) || 0
                      )
                    }
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    step="0.1"
                    min="0"
                  />
                  <span className="text-sm text-gray-500">
                    {balance.token_symbol}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Automatically convert to NGN when balance exceeds this amount
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors text-left">
            <ArrowRightLeft className="w-6 h-6 text-blue-600 mb-2" />
            <div className="font-medium text-gray-900">Quick Swap</div>
            <div className="text-sm text-gray-600">
              Exchange between currencies
            </div>
          </button>

          <button className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors text-left">
            <Lock className="w-6 h-6 text-emerald-600 mb-2" />
            <div className="font-medium text-gray-900">Lock to NGN</div>
            <div className="text-sm text-gray-600">
              Protect against volatility
            </div>
          </button>

          <button className="p-4 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors text-left">
            <Settings className="w-6 h-6 text-purple-600 mb-2" />
            <div className="font-medium text-gray-900">
              Auto-Convert Settings
            </div>
            <div className="text-sm text-gray-600">
              Configure automatic conversions
            </div>
          </button>
        </div>
      </div>

      {/* Conversion History */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Conversions
        </h3>
        <div className="space-y-3">
          {[
            {
              from: "ETH",
              to: "NGN",
              amount: "0.5 ETH",
              value: "₦1,960,000",
              time: "2 hours ago",
            },
            {
              from: "USDC",
              to: "NGN",
              amount: "200 USDC",
              value: "₦320,000",
              time: "1 day ago",
            },
            {
              from: "STRK",
              to: "NGN",
              amount: "100 STRK",
              value: "₦120,000",
              time: "2 days ago",
            },
          ].map((conversion, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1">
                  <span className="font-medium text-gray-900">
                    {conversion.from}
                  </span>
                  <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900">
                    {conversion.to}
                  </span>
                </div>
                <div className="text-sm text-gray-600">{conversion.amount}</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900">
                  {conversion.value}
                </div>
                <div className="text-sm text-gray-500">{conversion.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MultiCurrencyView;
