import React, { useEffect, useState, useMemo } from "react";
import {
  ArrowUpRight,
  AlertTriangle,
  CreditCard,
  Wallet,
  ChevronDown,
} from "lucide-react";
import { formatCurrency, formatCrypto } from "../../utils/amount";
import { UserTokenBalance } from "../../interfaces";
import { apiClient } from "../../utils/api";

type WithdrawType = "wallet" | "fiat";

const WithdrawView: React.FC = () => {
  const [withdrawType, setWithdrawType] = useState<WithdrawType>("wallet");
  const [selectedBalance, setSelectedBalance] =
    useState<UserTokenBalance | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [amount, setAmount] = useState<string>("0");
  const [isProcessing, setIsProcessing] = useState(false);
  const [balances, setBalances] = useState<UserTokenBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<UserTokenBalance[]>("/balances")
      .then(setBalances)
      .catch((err) => console.error("Error fetching balances:", err))
      .finally(() => setLoading(false));
  }, []);

  const maxAmount = selectedBalance ? Number(selectedBalance.amount) : 0;
  const inputAmount = Number(amount) || 0;

  const fees = useMemo(() => {
    const baseFee = 2.5;
    const platformFee = inputAmount * 0.01;
    const fiatFee = withdrawType === "fiat" ? 5 : 0;
    return {
      baseFee,
      platformFee,
      fiatFee,
      total: baseFee + platformFee + fiatFee,
    };
  }, [inputAmount, withdrawType]);

  const isValidAmount = inputAmount > 0 && inputAmount <= maxAmount;
  const isValidRecipient =
    withdrawType === "wallet"
      ? recipientAddress.trim().length > 0
      : bankAccount.trim().length > 0;

  const handleWithdraw = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      alert("Withdrawal initiated successfully!");
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Withdraw Type */}
      <FormSection title="Withdrawal Method">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WithdrawMethodCard
            type="wallet"
            label="Crypto Wallet"
            description="Send to external wallet"
            active={withdrawType === "wallet"}
            onClick={() => setWithdrawType("wallet")}
            Icon={Wallet}
          />
          <WithdrawMethodCard
            type="fiat"
            label="Bank Account (NGN)"
            description="Convert to Naira via Paystack"
            active={withdrawType === "fiat"}
            onClick={() => setWithdrawType("fiat")}
            Icon={CreditCard}
          />
        </div>
      </FormSection>

      {/* Asset Selection */}
      <FormSection title="Select Asset">
        <div className="relative">
          <select
            value={selectedBalance?.id ?? ""}
            onChange={(e) =>
              setSelectedBalance(
                balances.find((b) => b.id.toString() === e.target.value) || null
              )
            }
            className="w-full p-4 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select One</option>
            {balances.map((b) => (
              <option key={b.id} value={b.id}>
                {b.token_symbol} -{" "}
                {formatCrypto(Number(b.amount), b.token_symbol)} (
                {formatCurrency(Number(b.usd_value))})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        </div>
      </FormSection>

      {/* Amount Input */}
      <FormSection title="Amount">
        <div className="space-y-4">
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Enter ${
                selectedBalance?.token_symbol ?? ""
              } amount`}
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setAmount(maxAmount.toString())}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 font-medium text-sm hover:text-blue-800"
            >
              MAX
            </button>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>
              Available:{" "}
              {selectedBalance &&
                formatCrypto(maxAmount, selectedBalance.token_symbol)}
            </span>
            {amount && selectedBalance && (
              <span>≈ {formatCurrency(Number(selectedBalance.usd_value))}</span>
            )}
          </div>
        </div>
      </FormSection>

      {/* Recipient */}
      <FormSection
        title={
          withdrawType === "wallet"
            ? "Recipient Wallet Address"
            : "Bank Account Details"
        }
      >
        {withdrawType === "wallet" ? (
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="Enter wallet address (0x...)"
            className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="Account Number"
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <select className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">Select Bank</option>
              <option value="gtbank">GTBank</option>
              <option value="access">Access Bank</option>
              <option value="zenith">Zenith Bank</option>
              <option value="first">First Bank</option>
              <option value="uba">UBA</option>
            </select>
          </div>
        )}
      </FormSection>

      {/* Fees */}
      <FormSection title="Fee Breakdown">
        <div className="space-y-2 text-sm">
          <FeeRow label="Network Fee:" value="$2.50" />
          <FeeRow
            label="Platform Fee (1%):"
            value={formatCurrency(fees.platformFee)}
          />
          {withdrawType === "fiat" && (
            <FeeRow label="Fiat Conversion Fee:" value="$5.00" />
          )}
          <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between text-base font-semibold">
            <span>Total Fees:</span>
            <span>${fees.total.toFixed(2)}</span>
          </div>
        </div>
      </FormSection>

      {/* Warning */}
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex space-x-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium mb-1">Important:</p>
          <ul className="space-y-1">
            <li>• Withdrawals are irreversible once processed</li>
            <li>
              •{" "}
              {withdrawType === "wallet"
                ? "Double-check the recipient address"
                : "Bank transfers may take 1-3 business days"}
            </li>
            <li>• Contact support if you encounter any issues</li>
          </ul>
        </div>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleWithdraw}
        disabled={!isValidAmount || !isValidRecipient || isProcessing}
        className={`w-full py-4 px-6 rounded-lg font-semibold transition-all ${
          isValidAmount && isValidRecipient && !isProcessing
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
        }`}
      >
        {isProcessing ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Processing...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2">
            <ArrowUpRight className="w-5 h-5" />
            <span>
              {withdrawType === "wallet"
                ? "Withdraw to Wallet"
                : "Withdraw to Bank Account"}
            </span>
          </div>
        )}
      </button>
    </div>
  );
};

/* 🔹 Reusable small components */
const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="bg-white rounded-xl p-6 border border-gray-200">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
    {children}
  </div>
);

const WithdrawMethodCard: React.FC<{
  type: WithdrawType;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
  Icon: React.ElementType;
}> = ({ label, description, active, onClick, Icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-4 rounded-lg border-2 transition-all ${
      active
        ? "border-blue-500 bg-blue-50"
        : "border-gray-200 hover:border-gray-300"
    }`}
  >
    <div className="flex items-center space-x-3">
      <div
        className={`p-2 rounded-lg ${active ? "bg-blue-100" : "bg-gray-100"}`}
      >
        <Icon
          className={`w-5 h-5 ${active ? "text-blue-600" : "text-gray-600"}`}
        />
      </div>
      <div className="text-left">
        <div className="font-semibold text-gray-900">{label}</div>
        <div className="text-sm text-gray-500">{description}</div>
      </div>
    </div>
  </button>
);

const FeeRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex justify-between">
    <span className="text-gray-600">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export default WithdrawView;
