import React from 'react';
import { Users, DollarSign, TrendingUp, Activity } from 'lucide-react';
import StatsCard from '../Dashboard/StatsCard';
import TransactionTable from '../Dashboard/TransactionTable';
import { mockTransactions, formatCurrency } from '../../utils/mockData';
import { UserTransaction } from '../../interfaces';

const AdminDashboard: React.FC = () => {
  const totalUsers = 32;
  const totalVolume = 8500;
  const totalFees = 85;
  const activeUsers = 18;

  // Extended mock data for admin view
  const adminTransactions: UserTransaction[] = [
    {
      id: 4,
      user_id: 1,
      token_id: 2,
      chain_id: 1,
      reference: 'REF004',
      type: 'deposit',
      status: 'completed',
      tx_hash: '0x456...def',
      usd_value: 1000,
      amount: 1000,
      timestamp: '2024-01-20T11:30:00Z',
      from_address: '0x123...abc',
      to_address: '0x742d35Cc6634C0532925a3b8D404FdDA8C6b8AC2',
      description: null,
      extra: null,
      created_at: '2024-01-20T11:30:00Z',
      updated_at: '2024-01-20T11:30:00Z',
      user_email: 'john@example.com',
      user_tag: 'john_doe',
      token_name: 'USD Coin',
      token_symbol: 'USDC',
      token_logo_url: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
      token_price: '1.0',
      chain_name: 'Ethereum',
      chain_symbol: 'ETH'
    },
    {
      id: 5,
      user_id: 2,
      token_id: 1,
      chain_id: 1,
      reference: 'REF005',
      type: 'withdrawal',
      status: 'pending',
      tx_hash: '0x789...ghi',
      usd_value: 1960,
      amount: 0.8,
      timestamp: '2024-01-20T10:15:00Z',
      from_address: '0x742d35Cc6634C0532925a3b8D404FdDA8C6b8AC2',
      to_address: '0x789...ghi',
      description: null,
      extra: null,
      created_at: '2024-01-20T10:15:00Z',
      updated_at: '2024-01-20T10:15:00Z',
      user_email: 'alice@example.com',
      user_tag: 'alice_crypto',
      token_name: 'Ethereum',
      token_symbol: 'ETH',
      token_logo_url: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
      token_price: '2450.0',
      chain_name: 'Ethereum',
      chain_symbol: 'ETH'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Admin Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Users"
          value={totalUsers.toLocaleString()}
          change="+5.2% from last month"
          changeType="positive"
          icon={Users}
          iconColor="text-blue-600"
        />
        <StatsCard
          title="Total Volume"
          value={formatCurrency(totalVolume)}
          change="+18.3% from last month"
          changeType="positive"
          icon={DollarSign}
          iconColor="text-emerald-600"
        />
        <StatsCard
          title="Platform Fees"
          value={formatCurrency(totalFees)}
          change="+12.1% from last month"
          changeType="positive"
          icon={TrendingUp}
          iconColor="text-purple-600"
        />
        <StatsCard
          title="Active Users (30d)"
          value={activeUsers.toLocaleString()}
          change="+8.7% from last month"
          changeType="positive"
          icon={Activity}
          iconColor="text-amber-600"
        />
      </div>

      {/* Business Development Milestones */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Development Roadmap</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <div className="font-medium text-gray-900">Mobile App Launch</div>
              <div className="text-sm text-gray-600">iOS & Android apps built and ready</div>
            </div>
            <span className="px-3 py-1 text-xs font-medium rounded-full text-emerald-600 bg-emerald-50">Completed</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div>
              <div className="font-medium text-gray-900">Beta Testing Phase</div>
              <div className="text-sm text-gray-600">Target: Before Feb 28, 2026</div>
            </div>
            <span className="px-3 py-1 text-xs font-medium rounded-full text-amber-600 bg-amber-100">In Progress</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <div className="font-medium text-gray-900">Full Rollout</div>
              <div className="text-sm text-gray-600">Target: Before Feb 28, 2026</div>
            </div>
            <span className="px-3 py-1 text-xs font-medium rounded-full text-gray-600 bg-gray-100">Planned</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <div className="font-medium text-gray-900">SDK Rollout</div>
              <div className="text-sm text-gray-600">Target: April 2026</div>
            </div>
            <span className="px-3 py-1 text-xs font-medium rounded-full text-gray-600 bg-gray-100">Planned</span>
          </div>
        </div>
      </div>

      {/* Growth Projections */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Growth Projections (2026)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Current Users</div>
            <div className="text-3xl font-bold text-blue-600 mb-1">32</div>
            <div className="text-xs text-gray-500">→</div>
            <div className="text-sm text-gray-600 mt-1">Target by Mar 1</div>
            <div className="text-2xl font-bold text-emerald-600">1,000</div>
            <div className="text-xs text-emerald-600 font-medium mt-1">+3,025%</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Feb Volume Target</div>
            <div className="text-3xl font-bold text-purple-600">$5,000+</div>
            <div className="text-xs text-gray-500 mt-2">Monthly</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Mar Volume Target</div>
            <div className="text-3xl font-bold text-emerald-600">$5,000+</div>
            <div className="text-xs text-gray-500 mt-2">Monthly</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Post-SDK Target</div>
            <div className="text-3xl font-bold text-amber-600">5,000+</div>
            <div className="text-xs text-gray-500 mt-2">By July 31, 2026</div>
          </div>
        </div>
      </div>

      {/* System Health */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600 mb-1">99.9%</div>
            <div className="text-sm text-gray-600">Uptime</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 mb-1">145ms</div>
            <div className="text-sm text-gray-600">Avg Response Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 mb-1">47</div>
            <div className="text-sm text-gray-600">Transactions Today</div>
          </div>
        </div>
      </div>

      {/* Chain Status */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Blockchain Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'Ethereum', status: 'healthy', blockHeight: '18,500,234' },
            { name: 'Starknet', status: 'healthy', blockHeight: '445,123' },
            { name: 'Base', status: 'healthy', blockHeight: '8,234,567' },
            { name: 'Core', status: 'syncing', blockHeight: '2,345,678' }
          ].map(chain => (
            <div key={chain.name} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{chain.name}</span>
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${chain.status === 'healthy'
                    ? 'text-emerald-600 bg-emerald-50'
                    : 'text-amber-600 bg-amber-50'
                  }`}>
                  {chain.status}
                </span>
              </div>
              <div className="text-sm text-gray-600">Block: {chain.blockHeight}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <TransactionTable transactions={adminTransactions} showUserColumn={true} />

      {/* Top Users */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Users by Volume</h3>
        <div className="space-y-4">
          {[
            { tag: 'llins', volume: 2100, transactions: 8 },
            { tag: 'john_doe', volume: 1500, transactions: 6 },
            { tag: 'alice_crypto', volume: 1200, transactions: 5 },
            { tag: 'sarah_lagos', volume: 950, transactions: 4 },
            { tag: 'crypto_fan', volume: 780, transactions: 3 }
          ].map((user, index) => (
            <div key={user.tag} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {index + 1}
                </div>
                <div>
                  <div className="font-medium text-blue-600">@{user.tag}</div>
                  <div className="text-sm text-gray-500">{user.transactions} transactions</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">{formatCurrency(user.volume)}</div>
                <div className="text-sm text-gray-500">30d volume</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;