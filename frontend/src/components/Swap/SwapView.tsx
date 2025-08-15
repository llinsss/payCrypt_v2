import React, { useState, useEffect } from 'react';
import { ArrowUpDown, Settings, RefreshCw } from 'lucide-react';
import { mockBalances, mockTokens, formatCurrency, formatCrypto } from '../../utils/mockData';

const SwapView: React.FC = () => {
  const [fromToken, setFromToken] = useState('ETH');
  const [toToken, setToToken] = useState('USDC');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [isLoading, setIsLoading] = useState(false);

  const fromBalance = mockBalances.find(b => b.symbol === fromToken);
  const toTokenData = mockTokens.find(t => t.symbol === toToken);
  const fromTokenData = mockTokens.find(t => t.symbol === fromToken);

  const calculateToAmount = (amount: string) => {
    if (!amount || !fromTokenData || !toTokenData) return '';
    const rate = fromTokenData.price / toTokenData.price;
    return (parseFloat(amount) * rate).toFixed(6);
  };

  useEffect(() => {
    if (fromAmount) {
      setToAmount(calculateToAmount(fromAmount));
    }
  }, [fromAmount, fromToken, toToken]);

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    const tempAmount = fromAmount;
    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const handleMaxClick = () => {
    if (fromBalance) {
      setFromAmount(fromBalance.amount.toString());
    }
  };

  const handleSwap = () => {
    setIsLoading(true);
    // Simulate swap process
    setTimeout(() => {
      setIsLoading(false);
      alert('Swap completed successfully!');
      setFromAmount('');
      setToAmount('');
    }, 3000);
  };

  const isValidSwap = fromAmount && parseFloat(fromAmount) > 0 && parseFloat(fromAmount) <= (fromBalance?.amount || 0);
  const priceImpact = Math.random() * 0.5; // Mock price impact
  const estimatedGas = 15.50; // Mock gas fee

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
                Balance: {fromBalance ? formatCrypto(fromBalance.amount, fromBalance.symbol) : '0'}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {mockBalances.map(balance => (
                  <option key={balance.symbol} value={balance.symbol}>
                    {balance.symbol}
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
                onClick={handleMaxClick}
                className="text-blue-600 font-medium text-sm hover:text-blue-800"
              >
                MAX
              </button>
            </div>
            {fromAmount && fromTokenData && (
              <div className="text-sm text-gray-500 mt-1">
                ≈ {formatCurrency(parseFloat(fromAmount) * fromTokenData.price)}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <button
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
                Balance: {mockBalances.find(b => b.symbol === toToken)?.amount.toFixed(4) || '0'} {toToken}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {mockTokens.filter(token => token.symbol !== fromToken).map(token => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={toAmount}
                readOnly
                placeholder="0.0"
                className="flex-1 bg-transparent text-2xl font-semibold focus:outline-none text-gray-600"
              />
            </div>
            {toAmount && toTokenData && (
              <div className="text-sm text-gray-500 mt-1">
                ≈ {formatCurrency(parseFloat(toAmount) * toTokenData.price)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Swap Details */}
      {fromAmount && toAmount && (
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Swap Details</h4>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Exchange Rate:</span>
              <span className="font-medium">
                1 {fromToken} = {calculateToAmount('1')} {toToken}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Price Impact:</span>
              <span className={`font-medium ${priceImpact > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                {priceImpact.toFixed(2)}%
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
                  {(parseFloat(toAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {toToken}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slippage Settings */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Slippage Tolerance</h4>
        <div className="flex space-x-2">
          {['0.1', '0.5', '1.0'].map(value => (
            <button
              key={value}
              onClick={() => setSlippage(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                slippage === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {value}%
            </button>
          ))}
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm w-20 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            step="0.1"
            min="0.1"
            max="50"
          />
          <span className="px-2 py-2 text-sm text-gray-600">%</span>
        </div>
      </div>

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={!isValidSwap || isLoading}
        className={`w-full py-4 px-6 rounded-lg font-semibold transition-all ${
          isValidSwap && !isLoading
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Swapping...</span>
          </div>
        ) : (
          `Swap ${fromToken} for ${toToken}`
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