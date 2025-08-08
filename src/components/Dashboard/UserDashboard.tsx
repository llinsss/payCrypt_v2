import React from 'react';
import { Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import StatsCard from './StatsCard';
import TransactionTable from './TransactionTable';
import { mockBalances, mockTransactions, formatCurrency } from '../../utils/mockData';

const UserDashboard: React.FC = () => {
  const totalBalance = mockBalances.reduce((sum, balance) => sum + balance.usdValue, 0);
  const totalDeposits = mockTransactions
    .filter(tx => tx.type === 'deposit' && tx.status === 'completed')
    .reduce((sum, tx) => sum + tx.usdValue, 0);
  const totalWithdrawals = mockTransactions
    .filter(tx => tx.type === 'withdrawal' && tx.status === 'completed')
    .reduce((sum, tx) => sum + tx.usdValue, 0);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Balance"
          value={formatCurrency(totalBalance)}
          change="+12.5% from last month"
          changeType="positive"
          icon={Wallet}
          iconColor="text-blue-600"
        />
        <StatsCard
          title="Total Deposits"
          value={formatCurrency(totalDeposits)}
          change="+8.2% from last month"
          changeType="positive"
          icon={ArrowDownLeft}
          iconColor="text-emerald-600"
        />
        <StatsCard
          title="Total Withdrawals"
          value={formatCurrency(totalWithdrawals)}
          change="+5.1% from last month"
          changeType="positive"
          icon={ArrowUpRight}
          iconColor="text-red-600"
        />
        <StatsCard
          title="Portfolio Growth"
          value="+24.8%"
          change="Last 30 days"
          changeType="positive"
          icon={TrendingUp}
          iconColor="text-purple-600"
        />
      </div>

      {/* Balances Overview */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Asset Balances</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {mockBalances.map((balance, index) => (
            <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    {balance.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                  <div className="text-sm text-gray-600">{balance.symbol}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {formatCurrency(balance.usdValue)}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">{balance.chain}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <TransactionTable transactions={mockTransactions.slice(0, 5)} />

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow text-left">
            <ArrowDownLeft className="w-6 h-6 text-emerald-600 mb-2" />
            <div className="font-medium text-gray-900">Receive Funds</div>
            <div className="text-sm text-gray-600">Share your @llins tag</div>
          </button>
          <button className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow text-left">
            <ArrowUpRight className="w-6 h-6 text-red-600 mb-2" />
            <div className="font-medium text-gray-900">Withdraw</div>
            <div className="text-sm text-gray-600">To wallet or fiat</div>
          </button>
          <button className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow text-left">
            <TrendingUp className="w-6 h-6 text-blue-600 mb-2" />
            <div className="font-medium text-gray-900">Swap Tokens</div>
            <div className="text-sm text-gray-600">Exchange crypto assets</div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;