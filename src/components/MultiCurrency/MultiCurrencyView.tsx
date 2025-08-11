import React, { useState } from 'react';
import { ArrowRightLeft, Lock, Unlock, TrendingUp, TrendingDown, Settings } from 'lucide-react';
import { mockBalances, formatCurrency, formatCrypto } from '../../utils/mockData';

const MultiCurrencyView: React.FC = () => {
  const [autoConvert, setAutoConvert] = useState<{[key: string]: boolean}>({
    ETH: false,
    USDC: true,
    STRK: false,
    CORE: false
  });
  const [conversionThreshold, setConversionThreshold] = useState<{[key: string]: number}>({
    ETH: 0.1,
    USDC: 100,
    STRK: 50,
    CORE: 25
  });

  // Extended balances with fiat
  const extendedBalances = [
    ...mockBalances,
    {
      token: 'NGN',
      symbol: 'NGN',
      amount: 125000,
      usdValue: 125000 / 1600, // Assuming 1 USD = 1600 NGN
      chain: 'fiat'
    }
  ];

  const handleAutoConvertToggle = (symbol: string) => {
    setAutoConvert(prev => ({
      ...prev,
      [symbol]: !prev[symbol]
    }));
  };

  const handleThresholdChange = (symbol: string, value: number) => {
    setConversionThreshold(prev => ({
      ...prev,
      [symbol]: value
    }));
  };

  const handleQuickSwap = (fromSymbol: string, toSymbol: string) => {
    alert(`Swapping ${fromSymbol} to ${toSymbol}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Multi-Currency Management</h2>
        <p className="text-gray-600">Manage your crypto and fiat balances with auto-conversion</p>
      </div>

      {/* Portfolio Overview */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Total Portfolio Value</h3>
        <div className="text-3xl font-bold mb-2">
          {formatCurrency(extendedBalances.reduce((sum, balance) => sum + balance.usdValue, 0))}
        </div>
        <div className="flex items-center space-x-2 text-blue-100">
          <TrendingUp className="w-4 h-4" />
          <span className="text-sm">+8.5% (24h)</span>
        </div>
      </div>

      {/* Currency Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {extendedBalances.map((balance, index) => {
          const changePercent = Math.random() > 0.5 ? 
            +(Math.random() * 10).toFixed(2) : 
            -(Math.random() * 10).toFixed(2);
          const isPositive = changePercent > 0;
          const isAutoConvertEnabled = autoConvert[balance.symbol];

          return (
            <div key={index} className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    balance.chain === 'fiat' ? 'bg-green-100' : 'bg-gradient-to-r from-blue-500 to-purple-500'
                  }`}>
                    <span className={`font-bold text-sm ${
                      balance.chain === 'fiat' ? 'text-green-600' : 'text-white'
                    }`}>
                      {balance.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{balance.symbol}</div>
                    <div className="text-sm text-gray-500 capitalize">
                      {balance.chain === 'fiat' ? 'Fiat Currency' : balance.chain}
                    </div>
                  </div>
                </div>
                
                {balance.chain !== 'fiat' && (
                  <button
                    onClick={() => handleAutoConvertToggle(balance.symbol)}
                    className={`p-2 rounded-lg transition-colors ${
                      isAutoConvertEnabled 
                        ? 'bg-emerald-100 text-emerald-600' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                    title={isAutoConvertEnabled ? 'Auto-convert enabled' : 'Auto-convert disabled'}
                  >
                    {isAutoConvertEnabled ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {balance.chain === 'fiat' 
                      ? formatCurrency(balance.amount, 'NGN')
                      : balance.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })
                    }
                  </div>
                  {balance.chain !== 'fiat' && (
                    <div className="text-sm text-gray-500">{balance.symbol}</div>
                  )}
                </div>
                <div className="text-lg font-semibold text-gray-700">
                  {formatCurrency(balance.usdValue)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className={`flex items-center space-x-1 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span className="text-sm font-medium">{isPositive ? '+' : ''}{changePercent}%</span>
                </div>
                
                {balance.chain !== 'fiat' && (
                  <button
                    onClick={() => handleQuickSwap(balance.symbol, 'NGN')}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Auto-convert settings */}
              {balance.chain !== 'fiat' && isAutoConvertEnabled && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Auto-convert threshold:</div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={conversionThreshold[balance.symbol] || 0}
                      onChange={(e) => handleThresholdChange(balance.symbol, parseFloat(e.target.value) || 0)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      step="0.1"
                      min="0"
                    />
                    <span className="text-sm text-gray-500">{balance.symbol}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Automatically convert to NGN when balance exceeds this amount
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors text-left">
            <ArrowRightLeft className="w-6 h-6 text-blue-600 mb-2" />
            <div className="font-medium text-gray-900">Quick Swap</div>
            <div className="text-sm text-gray-600">Exchange between currencies</div>
          </button>
          
          <button className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors text-left">
            <Lock className="w-6 h-6 text-emerald-600 mb-2" />
            <div className="font-medium text-gray-900">Lock to NGN</div>
            <div className="text-sm text-gray-600">Protect against volatility</div>
          </button>
          
          <button className="p-4 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors text-left">
            <Settings className="w-6 h-6 text-purple-600 mb-2" />
            <div className="font-medium text-gray-900">Auto-Convert Settings</div>
            <div className="text-sm text-gray-600">Configure automatic conversions</div>
          </button>
        </div>
      </div>

      {/* Conversion History */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Conversions</h3>
        <div className="space-y-3">
          {[
            { from: 'ETH', to: 'NGN', amount: '0.5 ETH', value: '₦1,960,000', time: '2 hours ago' },
            { from: 'USDC', to: 'NGN', amount: '200 USDC', value: '₦320,000', time: '1 day ago' },
            { from: 'STRK', to: 'NGN', amount: '100 STRK', value: '₦120,000', time: '2 days ago' }
          ].map((conversion, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1">
                  <span className="font-medium text-gray-900">{conversion.from}</span>
                  <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{conversion.to}</span>
                </div>
                <div className="text-sm text-gray-600">{conversion.amount}</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900">{conversion.value}</div>
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