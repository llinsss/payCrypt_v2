import React, { useEffect, useState } from "react";
import { apiClient } from "../../utils/api";
import { formatCurrency } from "../../utils/amount";
import { ArrowRightLeft, Lock, Unlock, Settings } from "lucide-react";
import { DashboardSummary, UserTokenBalance } from "../../interfaces";
const MultiCurrencyView: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState<number | null>(null); // which balance is submitting
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [balances, setBalances] = useState<UserTokenBalance[]>([]);
  const [thresholds, setThresholds] = useState<Record<number, string>>({}); // store thresholds by ID

  // Fetch dashboard
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

  // Fetch balances
  useEffect(() => {
    const fetchUserTokenBalance = async () => {
      try {
        const data = await apiClient.get<UserTokenBalance[]>("/balances");
        setBalances(data);
        const init: Record<number, string> = {};
        data.forEach((b) => {
          init[b.id] = b.auto_convert_threshold ?? "";
        });
        setThresholds(init);
      } catch (error) {
        console.error("Error fetching balances:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserTokenBalance();
  }, []);

  const handleSubmit = async (
    e: React.FormEvent,
    balance: UserTokenBalance
  ) => {
    e.preventDefault();
    const threshold = thresholds[balance.id];

    if (!threshold) {
      alert("Please enter an amount to auto convert");
      return;
    }

    setIsSubmitting(balance.id);
    try {
      const response = await apiClient.put(`/balances/${balance.id}`, {
        auto_convert_threshold: threshold,
      });
      console.log(response);
      alert("New threshold set.");
    } catch (error) {
      console.error("Set new threshold failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to set new threshold. Please try again."
      );
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleThresholdChange = (id: number, value: string) => {
    setThresholds((prev) => ({
      ...prev,
      [id]: value,
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

      {/* Portfolio */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Total Portfolio Value</h3>
        <div className="text-3xl font-bold mb-2">
          {formatCurrency(loading ? 0 : summary?.total_balance)}
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {balances.map((balance) => (
          <div
            key={balance.id}
            className="bg-white rounded-xl p-6 border border-gray-200"
          >
            {/* Balance header */}
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
                className={`p-2 rounded-lg transition-colors ${
                  balance.auto_convert_threshold
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {balance.auto_convert_threshold ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Balance amount */}
            <div className="space-y-2 mb-4">
              <div className="text-2xl font-bold text-gray-900">
                {balance.amount.toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}{" "}
                {balance.token_symbol}
              </div>
              <div className="text-lg font-semibold text-gray-700">
                {balance.usd_value} USD
              </div>
            </div>

            {/* Quick swap */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleQuickSwap(balance.token_symbol, "NGN")}
                className="flex border border-blue-300 px-4 py-2 rounded-full items-center text-blue-600 hover:text-blue-800 transition-colors"
              >
                <ArrowRightLeft className="w-4 h-4 mr-2" /> Swap all{" "}
                {balance.token_symbol} to NGN
              </button>
            </div>

            {/* Threshold form */}
            <form
              onSubmit={(e) => handleSubmit(e, balance)}
              className="mt-4 pt-4 border-t border-gray-200 flex flex-col space-y-2"
            >
              <input type="hidden" value={balance.id} />
              <input
                type="number"
                step="any"
                min="0"
                value={thresholds[balance.id] ?? ""}
                onChange={(e) =>
                  handleThresholdChange(balance.id, e.target.value)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded text-xl"
                placeholder="Enter threshold"
              />
              <div className="text-xs text-gray-500">
                Automatically convert to NGN when balance exceeds this amount
              </div>
              <button
                type="submit"
                disabled={isSubmitting === balance.id}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isSubmitting === balance.id ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>
                    {balance.auto_convert_threshold
                      ? "Update threshold"
                      : "Set threshold"}
                  </span>
                )}
              </button>
            </form>
          </div>
        ))}
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
