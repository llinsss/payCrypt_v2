import React, { useEffect, useState, useMemo } from "react";
import { Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import StatsCard from "./StatsCard";
import TransactionTable from "./TransactionTable";
import { apiClient } from "../../utils/api";
import { formatCrypto, formatCurrency } from "../../utils/amount";
import { useAuth } from "../../contexts/AuthContext";
import { NavLink } from "react-router-dom";
import {
  DashboardSummary,
  UserTokenBalance,
  UserTransaction,
} from "../../interfaces";

const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [balances, setBalances] = useState<UserTokenBalance[]>([]);
  const [userTransactions, setUserTransactions] = useState<UserTransaction[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [balancesRes, summaryRes, transactionsRes] = await Promise.all([
          apiClient.get<UserTokenBalance[]>("/balances"),
          apiClient.get<DashboardSummary>("/users/dashboard-summary"),
          apiClient.get<UserTransaction[]>("/transactions"),
        ]);

        setBalances(balancesRes || []);
        setSummary(summaryRes || null);
        setUserTransactions(transactionsRes || []);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // 🧮 Memoized computed values
  const stats = useMemo(
    () => [
      {
        title: "Total Balance",
        value: formatCurrency(summary?.total_balance ?? 0),
        icon: Wallet,
        color: "text-blue-600",
      },
      {
        title: "Total Deposits",
        value: formatCurrency(summary?.total_deposit ?? 0),
        icon: ArrowDownLeft,
        color: "text-emerald-600",
      },
      {
        title: "Total Withdrawals",
        value: formatCurrency(summary?.total_withdrawal ?? 0),
        icon: ArrowUpRight,
        color: "text-red-600",
      },
      {
        title: "Portfolio Growth",
        value: `+${formatCurrency(0)}%`, // TODO: replace with real growth calc
        icon: TrendingUp,
        color: "text-purple-600",
      },
    ],
    [summary]
  );

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {stats.map(({ title, value, icon, color }) => (
          <StatsCard
            key={title}
            title={title}
            value={loading ? "--" : value}
            change=""
            changeType="positive"
            icon={icon}
            iconColor={color}
          />
        ))}
      </div>

      {/* Balances Overview */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Asset Balances
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {balances.map((balance) => (
            <div
              key={balance.id}
              className="p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    {formatCrypto(balance.amount, balance.token_symbol)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {formatCurrency(balance.usd_value)}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {balance.token_name}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <TransactionTable transactions={userTransactions.slice(0, 5)} />

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavLink
            to="/deposits"
            className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow text-left"
          >
            <ArrowDownLeft className="w-6 h-6 text-emerald-600 mb-2" />
            <div className="font-medium text-gray-900">Receive Funds</div>
            <div className="text-sm text-gray-600">Share your @{user?.tag}</div>
          </NavLink>
          <NavLink
            to="/withdraw"
            className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow text-left"
          >
            <ArrowUpRight className="w-6 h-6 text-red-600 mb-2" />
            <div className="font-medium text-gray-900">Withdraw</div>
            <div className="text-sm text-gray-600">To wallet or fiat</div>
          </NavLink>
          <NavLink
            to="/swap"
            className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow text-left"
          >
            <TrendingUp className="w-6 h-6 text-blue-600 mb-2" />
            <div className="font-medium text-gray-900">Swap Tokens</div>
            <div className="text-sm text-gray-600">Exchange crypto assets</div>
          </NavLink>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
