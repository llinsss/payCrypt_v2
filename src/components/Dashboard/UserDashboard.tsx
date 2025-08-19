import React, { useEffect, useState } from "react";
import { Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import StatsCard from "./StatsCard";
import TransactionTable from "./TransactionTable";
import { apiClient } from "../../utils/api";
import { formatCrypto, formatCurrency } from "../../utils/amount";
import { useAuth } from "../../contexts/AuthContext";
import {
  DashboardSummary,
  UserTokenBalance,
  UserTransaction,
} from "../../interfaces";

const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [balances, setBalances] = useState<UserTokenBalance[] | []>([]);
  const [userTransactions, setUserTransactions] = useState<
    UserTransaction[] | []
  >([]);
  const [loading, setLoading] = useState(true);

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
    const fetchUserTransaction = async () => {
      try {
        const data = await apiClient.get<UserTransaction[]>("/transactions");
        setUserTransactions(data);
      } catch (error) {
        console.error("Error fetching transactions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserTransaction();
  }, []);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatsCard
          title="Total Balance"
          value={loading ? "--" : formatCurrency(summary?.total_balance)}
          change=""
          changeType="positive"
          icon={Wallet}
          iconColor="text-blue-600"
        />
        <StatsCard
          title="Total Deposits"
          value={loading ? "--" : formatCurrency(summary?.total_deposit)}
          change=""
          changeType="positive"
          icon={ArrowDownLeft}
          iconColor="text-emerald-600"
        />
        <StatsCard
          title="Total Withdrawals"
          value={loading ? "--" : formatCurrency(summary?.total_withdrawal)}
          change=""
          changeType="positive"
          icon={ArrowUpRight}
          iconColor="text-red-600"
        />
        <StatsCard
          title="Portfolio Growth"
          value={`+${formatCurrency(0)}%`}
          change=""
          changeType="positive"
          icon={TrendingUp}
          iconColor="text-purple-600"
        />
      </div>

      {/* Balances Overview */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Asset Balances
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {balances.map((balance: UserTokenBalance, index) => (
            <div
              key={index}
              className="p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    {formatCrypto(balance.amount, balance.token_symbol)}
                  </div>
                  {/* <div className="text-sm text-gray-600">{balance.token_symbol}</div> */}
                  {/* <img
                    src={balance.token_logo_url}
                    alt="logo"
                    width={16}
                    height={16}
                  /> */}
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
          <button className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow text-left">
            <ArrowDownLeft className="w-6 h-6 text-emerald-600 mb-2" />
            <div className="font-medium text-gray-900">Receive Funds</div>
            <div className="text-sm text-gray-600">
              Share your @{user.tag} tag
            </div>
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
