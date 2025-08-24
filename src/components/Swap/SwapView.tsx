import React, { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, Settings, RefreshCw } from "lucide-react";
import { formatCurrency, formatCrypto } from "../../utils/amount";
import { UserTokenBalance } from "../../interfaces";
import { apiClient } from "../../utils/api";

const SwapView: React.FC = () => {
  const [fromToken, setFromToken] = useState<UserTokenBalance | null>(null);
  const [toToken, setToToken] = useState<UserTokenBalance | null>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [isLoading, setIsLoading] = useState(false);
  const [balances, setBalances] = useState<UserTokenBalance[]>([]);

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        const data = await apiClient.get<UserTokenBalance[]>("/balances");
        setBalances(data);
      } catch (error) {
        console.error("Error fetching balances:", error);
      }
    };
    fetchBalances();
  }, []);

  // 🔹 Compute exchange rate (safe)
  const exchangeRate = useMemo(() => {
    if (!fromToken || !toToken) return null;
    return fromToken.token_price / toToken.token_price;
  }, [fromToken, toToken]);

  // 🔹 Derived toAmount
  const toAmount = useMemo(() => {
    if (!exchangeRate || !fromAmount) return "";
    return (Number(fromAmount) * exchangeRate).toFixed(6);
  }, [fromAmount, exchangeRate]);

  // 🔹 Validation
  const isValidSwap = useMemo(() => {
    const amount = Number(fromAmount);
    return (
      amount > 0 &&
      fromToken &&
      toToken &&
      fromToken.id !== toToken.id &&
      amount <= Number(fromToken.amount) // ✅ ensure user has enough balance
    );
  }, [fromAmount, fromToken, toToken]);

  const priceImpact = useMemo(() => (Math.random() * 0.5).toFixed(2), []);
  const estimatedGas = 15.5; // Mock

  const handleSwapTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
  };

  const handleMaxClick = () => {
    if (fromToken) setFromAmount(fromToken.amount.toString());
  };

  const handleSwap = () => {
    if (!isValidSwap) return;
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      alert("Swap completed successfully!");
      setFromAmount("");
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Swap Interface */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Swap Tokens</h3>
          <button className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* From Token */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">From</span>
              <span className="text-sm text-gray-600">
                Balance:{" "}
                {fromToken
                  ? formatCrypto(
                      Number(fromToken.amount),
                      fromToken.token_symbol
                    )
                  : "0"}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={fromToken?.id || ""}
                onChange={(e) =>
                  setFromToken(
                    balances.find((b) => b.id.toString() === e.target.value) ||
                      null
                  )
                }
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select token</option>
                {balances.map((balance) => (
                  <option key={balance.id} value={balance.id}>
                    {balance.token_symbol}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-2xl font-semibold focus:outline-none"
              />
              <button
                type="button"
                onClick={handleMaxClick}
                className="text-blue-600 font-medium text-sm hover:text-blue-800"
              >
                MAX
              </button>
            </div>
            {fromAmount && fromToken && (
              <div className="text-sm text-gray-500 mt-1">
                ≈ {formatCurrency(Number(fromAmount) * fromToken.token_price)}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwapTokens}
              className="p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            >
              <ArrowUpDown className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* To Token */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">To</span>
              <span className="text-sm text-gray-600">
                Balance:{" "}
                {toToken
                  ? formatCrypto(Number(toToken.amount), toToken.token_symbol)
                  : "0"}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={toToken?.id || ""}
                onChange={(e) =>
                  setToToken(
                    balances.find((b) => b.id.toString() === e.target.value) ||
                      null
                  )
                }
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select token</option>
                {balances.map((balance) => (
                  <option key={balance.id} value={balance.id}>
                    {balance.token_symbol}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={toAmount}
                readOnly
                placeholder="0.0"
                className="flex-1 bg-transparent text-2xl font-semibold text-gray-600"
              />
            </div>
            {toAmount && toToken && (
              <div className="text-sm text-gray-500 mt-1">
                ≈ {formatCurrency(Number(toAmount) * toToken.token_price)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Swap Details */}
      {isValidSwap && (
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">
            Swap Details
          </h4>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Exchange Rate:</span>
              <span className="font-medium">
                1 {fromToken?.token_symbol} = {exchangeRate?.toFixed(6)}{" "}
                {toToken?.token_symbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Price Impact:</span>
              <span
                className={`font-medium ${
                  Number(priceImpact) > 1 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {priceImpact}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Estimated Gas Fee:</span>
              <span className="font-medium">${estimatedGas}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Slippage Tolerance:</span>
              <span className="font-medium">{slippage}%</span>
            </div>
            <div className="border-t border-gray-200 pt-3 mt-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Minimum Received:</span>
                <span className="font-medium">
                  {(Number(toAmount) * (1 - Number(slippage) / 100)).toFixed(6)}{" "}
                  {toToken?.token_symbol}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slippage Settings */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">
          Slippage Tolerance
        </h4>
        <div className="flex space-x-2">
          {["0.1", "0.5", "1.0"].map((value) => (
            <button
              key={value}
              onClick={() => setSlippage(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                slippage === value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {value}%
            </button>
          ))}
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm w-20 focus:ring-2 focus:ring-blue-500"
            step="0.1"
            min="0.1"
            max="50"
          />
          <span className="px-2 py-2 text-sm text-gray-600">%</span>
        </div>
      </div>

      {/* Swap Button */}
      <button
      type="button"
        onClick={handleSwap}
        disabled={!isValidSwap || isLoading}
        className={`w-full py-4 px-6 rounded-lg font-semibold transition-all ${
          isValidSwap && !isLoading
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
        }`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Swapping...</span>
          </div>
        ) : (
          `Swap ${fromToken?.token_symbol || "?"} → ${
            toToken?.token_symbol || "?"
          }`
        )}
      </button>

      {/* Powered By */}
      <div className="text-center text-sm text-gray-500">
        <p>Powered by Uniswap V3 • Best price guaranteed</p>
      </div>
    </div>
  );
};

export default SwapView;
