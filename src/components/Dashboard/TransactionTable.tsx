import React from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  ExternalLink,
} from "lucide-react";
import {
  getTransactionStatusColor,
  formatCurrency,
  formatCrypto,
} from "../../utils/mockData";
import { UserTransaction } from "../../interfaces";

interface TransactionTableProps {
  transactions: UserTransaction[];
  showUserColumn?: boolean;
}

const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  showUserColumn = false,
}) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return <ArrowDownLeft className="h-4 w-4 text-emerald-600" />;
      case "withdrawal":
        return <ArrowUpRight className="h-4 w-4 text-red-600" />;
      case "swap":
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
      default:
        return <ArrowRightLeft className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeLabel = (type: string) =>
    type.charAt(0).toUpperCase() + type.slice(1);

  const explorerLink = (tx: UserTransaction) =>
    tx.tx_hash ? `https://sepolia.voyager.online/tx/${tx.tx_hash}` : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-4 lg:px-6">
        <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
      </div>

      <div className="block lg:hidden">
        <ul aria-label="Recent transactions" className="divide-y divide-gray-200">
          {transactions.map((tx) => (
            <li key={tx.id} className="p-4 transition-colors hover:bg-gray-50">
              <article aria-labelledby={`transaction-${tx.id}-type`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {getTypeIcon(tx.type)}
                    <h4 id={`transaction-${tx.id}-type`} className="truncate text-sm font-medium text-gray-900">
                      {getTypeLabel(tx.type)}
                    </h4>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${getTransactionStatusColor(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>

                <dl className="space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="shrink-0 text-gray-500">Amount</dt>
                    <dd className="min-w-0 text-right">
                      <div className="break-words font-medium text-gray-900">{formatCrypto(Number(tx.amount), tx.token_symbol)}</div>
                      <div className="break-words text-xs text-gray-500">{formatCurrency(Number(tx.usd_value))}</div>
                    </dd>
                  </div>
                  {showUserColumn && (
                    <div className="flex items-start justify-between gap-4">
                      <dt className="shrink-0 text-gray-500">User</dt>
                      <dd className="min-w-0 break-all text-right font-medium text-blue-600">@{tx.user_tag}</dd>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <dt className="shrink-0 text-gray-500">Sender</dt>
                    <dd className="min-w-0 break-all text-right text-gray-900">{tx.from_address || "Not available"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="shrink-0 text-gray-500">Recipient</dt>
                    <dd className="min-w-0 break-all text-right text-gray-900">{tx.to_address || "Not available"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="shrink-0 text-gray-500">Date</dt>
                    <dd className="flex min-w-0 items-start justify-end gap-2 text-right text-gray-500">
                      <time dateTime={tx.timestamp} className="break-words">{new Date(tx.timestamp).toLocaleString()}</time>
                      {explorerLink(tx) && (
                        <a href={explorerLink(tx)} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${tx.tx_hash}`} title="View transaction" className="shrink-0 text-blue-600 transition-colors hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full">
          <caption className="sr-only">Recent transactions</caption>
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
              {showUserColumn && <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>}
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Sender</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Recipient</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {transactions.map((tx) => (
              <tr key={tx.id} className="transition-colors hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4"><div className="flex items-center space-x-3">{getTypeIcon(tx.type)}<span className="text-sm font-medium text-gray-900">{getTypeLabel(tx.type)}</span></div></td>
                {showUserColumn && <td className="whitespace-nowrap px-6 py-4"><span className="text-sm font-medium text-blue-600">@{tx.user_tag}</span></td>}
                <td className="whitespace-nowrap px-6 py-4"><div className="text-sm font-medium text-gray-900">{formatCrypto(Number(tx.amount), tx.token_symbol)}<div className="text-sm font-normal text-gray-500">{formatCurrency(Number(tx.usd_value))}</div></div></td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{tx.from_address || "Not available"}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{tx.to_address || "Not available"}</td>
                <td className="whitespace-nowrap px-6 py-4"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getTransactionStatusColor(tx.status)}`}>{tx.status}</span></td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500"><time dateTime={tx.timestamp}>{new Date(tx.timestamp).toLocaleDateString()}</time></td>
                <td className="whitespace-nowrap px-6 py-4">{explorerLink(tx) && <a href={explorerLink(tx)} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${tx.tx_hash}`} title="View transaction" className="text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionTable;
