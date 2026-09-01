"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@/lib/api";
import { useEffect, useState } from "react";

export default function SendPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [balanceId, setBalanceId] = useState("");
  const [balances, setBalances] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        const result = await apiClient.getBalances();
        setBalances(result.data || []);
      } catch (error) {
        console.error("Failed to fetch balances:", error);
      }
    };
    fetchBalances();
  }, []);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!recipient.trim()) {
      errors.recipient = "Recipient tag is required";
    } else if (!/^@?[a-zA-Z0-9_]{3,20}$/.test(recipient)) {
      errors.recipient = "Invalid tag format (3-20 alphanumeric characters)";
    }

    if (!amount || parseFloat(amount) <= 0) {
      errors.amount = "Amount must be greater than 0";
    }

    if (!balanceId) {
      errors.balanceId = "Please select a balance";
    }

    const selectedBalance = balances.find((b) => b.id === parseInt(balanceId));
    if (selectedBalance && parseFloat(amount) > parseFloat(selectedBalance.amount)) {
      errors.amount = "Insufficient balance";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.sendPayment(recipient, parseFloat(amount), parseInt(balanceId));
      setSuccess("Payment sent successfully!");
      setRecipient("");
      setAmount("");
      setBalanceId("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold mb-8">Send Payment</h1>

        <div className="max-w-md bg-white p-8 rounded-lg shadow-md">
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-100 text-green-700 rounded">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Recipient Tag</label>
              <input
                type="text"
                placeholder="@recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  validationErrors.recipient
                    ? "border-red-500 focus:ring-red-500"
                    : "focus:ring-blue-500"
                }`}
              />
              {validationErrors.recipient && (
                <p className="text-red-500 text-sm mt-1">{validationErrors.recipient}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  validationErrors.amount
                    ? "border-red-500 focus:ring-red-500"
                    : "focus:ring-blue-500"
                }`}
              />
              {validationErrors.amount && (
                <p className="text-red-500 text-sm mt-1">{validationErrors.amount}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">From Balance</label>
              <select
                value={balanceId}
                onChange={(e) => setBalanceId(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  validationErrors.balanceId
                    ? "border-red-500 focus:ring-red-500"
                    : "focus:ring-blue-500"
                }`}
              >
                <option value="">Select a balance</option>
                {balances.map((balance) => (
                  <option key={balance.id} value={balance.id}>
                    {balance.token_symbol} - {parseFloat(balance.amount).toFixed(2)}
                  </option>
                ))}
              </select>
              {validationErrors.balanceId && (
                <p className="text-red-500 text-sm mt-1">{validationErrors.balanceId}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Payment"}
            </button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
