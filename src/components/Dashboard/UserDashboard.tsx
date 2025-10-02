import React, { useEffect, useState, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Send,
  Eye,
  EyeOff,
  Plus,
  QrCode,
  RefreshCcw,
  Receipt,
} from "lucide-react";
import TransactionTable from "./TransactionTable";
import { apiClient } from "../../utils/api";
import {
  formatCrypto,
  formatCurrency,
  formatCurrencyToNGN,
} from "../../utils/amount";
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
  const [showBalance, setShowBalance] = useState(true);

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

  const totalCryptoValue = balances.reduce(
    (sum, balance) => Number(sum) + Number(balance.usd_value),
    0
  );

  const totalNgnValue = balances.reduce(
    (sum, balance) => Number(sum) + Number(balance.ngn_value),
    0
  );

  const stats = useMemo(
    () => [
      {
        title: "Available Balance",
        value: `${formatCurrencyToNGN(
          (totalNgnValue || summary?.total_balance) ?? 0
        )}`,
        icon: Wallet,
        subtitle: "NGN Wallet",
      },
      {
        title: "Total Portfolio",
        value: formatCurrency(summary?.total_balance ?? 0),
        icon: TrendingUp,
        subtitle: "All Assets",
      },
      {
        title: "Total Deposits",
        value: formatCurrency(summary?.total_deposit ?? 0),
        icon: ArrowDownLeft,
        subtitle: "Lifetime",
      },
      {
        title: "Total Withdrawals",
        value: formatCurrency(summary?.total_withdrawal ?? 0),
        icon: ArrowUpRight,
        subtitle: "Lifetime",
      },
    ],
    [summary, totalNgnValue]
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Wallet */}
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="w-full xl:w-1/2 bg-white border rounded-xl p-6 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-semibold text-gray-800">
                  Total Balance
                </h2>
                <button
                  type="button"
                  onClick={() => setShowBalance(!showBalance)}
                  className="p-1 rounded-md hover:bg-gray-100"
                >
                  {showBalance ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <h1 className="text-3xl font-bold mt-1">
                {showBalance
                  ? formatCurrency(
                      totalCryptoValue ?? (summary?.total_balance || 0)
                    )
                  : "••••••"}
              </h1>
              <p className="text-sm text-gray-500 mt-1">@{user?.tag}</p>
            </div>
            <div className="p-2 border rounded-lg bg-gray-50">
              <QrCode size={28} className="text-gray-600" />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="w-full flex justify-between items-center text-sm">
            <NavLink
              to="/deposits"
              className="flex flex-col items-center gap-1 hover:text-gray-900"
            >
              <ArrowDownLeft size={18} className="text-gray-500" />
              <span>Receive</span>
            </NavLink>
            <NavLink
              to="/withdraw"
              className="flex flex-col items-center gap-1 hover:text-gray-900"
            >
              <ArrowUpRight size={18} className="text-gray-500" />
              <span>Send</span>
            </NavLink>
            <NavLink
              to="/swap"
              className="flex flex-col items-center gap-1 hover:text-gray-900"
            >
              <RefreshCcw size={18} className="text-gray-500" />
              <span>Swap</span>
            </NavLink>
            <button
              type="button"
              className="flex flex-col items-center gap-1 hover:text-gray-900"
            >
              <Plus size={18} className="text-gray-500" />
              <span>More</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="w-full xl:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {stats.map(({ title, value, icon: Icon, subtitle }) => (
            <div
              key={title}
              className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon size={20} className="text-gray-500" />
                <div className="text-xs text-gray-500">{subtitle}</div>
              </div>
              <div className="text-sm text-gray-600 mb-1">{title}</div>
              <div className="text-xl font-semibold text-gray-800">
                {loading ? "--" : value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Balances Overview */}
      <div className="bg-white rounded-xl p-6 border shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-800">Your Assets</h3>
          <span className="text-sm text-gray-500">
            {balances.length} assets
          </span>
        </div>

        {/* Assets Grid */}
        <div className="space-y-3">
          {balances.map((balance) => {
            const hasBalance = Number(balance.amount) > 0;
            const usdValue = Number(balance.usd_value);
            const tokenPrice = Number(balance.token_price);

            return (
              <div
                key={balance.id}
                className="p-4 bg-gray-50 border rounded-xl hover:bg-white hover:shadow-md transition"
              >
                <div className="flex items-center justify-between">
                  {/* Token Info */}
                  <div className="flex items-center gap-3">
                    <img
                      src={`/${balance.token_logo_url}`}
                      alt={balance.token_name}
                      className="w-10 h-10 rounded-full border"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-800">
                          {balance.token_name}
                        </h4>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {balance.token_symbol}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Price: {formatCurrency(tokenPrice)}
                      </div>
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-800">
                      {formatCrypto(
                        Number(balance.amount),
                        balance.token_symbol
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatCurrency(usdValue)} USD
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {hasBalance && (
                  <div className="flex items-center justify-end gap-4 mt-4 pt-3 border-t">
                    <a
                      href="/withdraw"
                      className="flex flex-row space-x-1 hover:border hover:border-gray-300 hover:rounded-lg hover:p-2 items-center text-xs text-gray-600 hover:text-gray-900"
                    >
                      <Send size={12} /> <span>Send</span>
                    </a>
                    <a
                      href="/deposits"
                      className="flex flex-row space-x-1 border border-transparent hover:border-gray-300 hover:rounded-lg p-1.5 items-center text-xs text-gray-600 hover:text-gray-900"
                    >
                      <ArrowDownLeft size={12} /> <span>Receive</span>
                    </a>
                    <a
                      href="/swap"
                      className="flex flex-row space-x-1 hover:border hover:border-gray-300 hover:rounded-lg hover:p-2 items-center text-xs text-gray-600 hover:text-gray-900"
                    >
                      <RefreshCcw size={12} /> <span>Swap</span>
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {balances.filter((b) => Number(b.amount) > 0).length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Coins size={32} className="mx-auto mb-3 text-gray-400" />
            <p>No assets with balance</p>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border shadow-sm hover:shadow-md transition">
        <TransactionTable transactions={userTransactions.slice(0, 5)} />
      </div>
    </div>
  );
};

export default UserDashboard;
