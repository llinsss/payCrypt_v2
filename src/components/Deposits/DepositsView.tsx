import React, { useEffect, useState, useCallback } from "react";
import { Copy, Share2, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { UserTokenBalance } from "../../interfaces";
import { apiClient } from "../../utils/api";

const DepositsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<UserTokenBalance[]>([]);
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [copied, setCopied] = useState("");
  const { user } = useAuth();

  const userTag = `@${user?.tag}`;

  /** Fetch balances once on mount */
  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.get<UserTokenBalance[]>("/balances");
        setBalances(data);
      } catch (err) {
        console.error("Error fetching balances:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Copy helper */
  const handleCopy = useCallback((text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(""), 2000);
  }, []);

  return (
    <div className="space-y-6">
      {/* Deposit Instructions */}
      <InfoCard
        icon={<AlertCircle className="w-5 h-5 text-emerald-600" />}
        bg="bg-emerald-50"
        border="border-emerald-200"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          How to Receive Crypto
        </h3>
        <div className="text-gray-700 space-y-1">
          <p>
            • Share your unique tag{" "}
            <span className="font-mono bg-white px-2 py-1 rounded text-blue-600">
              {userTag}
            </span>{" "}
            with senders
          </p>
          <p>• Funds will appear in your balance once confirmed on-chain</p>
        </div>
      </InfoCard>

      {/* User Tag */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Your Unique Tag
        </h3>
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-blue-100 mb-1">Send crypto to:</div>
              <div className="text-3xl font-bold">{userTag}</div>
              <div className="text-sm text-blue-100 mt-2">
                Anyone can send you crypto using this tag
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <ActionButton
                onClick={() => handleCopy(userTag, "tag")}
                active={copied === "tag"}
                icon={
                  copied === "tag" ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )
                }
                label="Copy Tag"
              />
              <ActionButton
                icon={<Share2 className="w-4 h-4" />}
                label="Share"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Token Selection */}
      {/* <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Select Token
        </h3>
        {loading ? (
          <p className="text-center p-4">Loading please wait...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {balances.map((balance) => (
              <button
                key={balance.id}
                type="button"
                onClick={() => setSelectedToken(balance.id)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedToken === balance.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="text-left">
                  <div className="font-semibold text-gray-900">
                    {balance.token_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {balance.token_symbol}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div> */}

      {/* Security Notice */}
      <InfoCard
        icon={<AlertCircle className="w-5 h-5 text-amber-600" />}
        bg="bg-amber-50"
        border="border-amber-200"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Security Reminder
        </h3>
        <ul className="text-gray-700 space-y-1 list-disc list-inside">
          <li>Only accept crypto from trusted sources</li>
          <li>Double-check network compatibility before sending funds</li>
          <li>Large deposits may require additional verification</li>
          <li>Contact support if you don't see your deposit after 1 hour</li>
        </ul>
      </InfoCard>
    </div>
  );
};

/** Reusable card component */
const InfoCard: React.FC<{
  icon: React.ReactNode;
  children: React.ReactNode;
  bg: string;
  border: string;
}> = ({ icon, children, bg, border }) => (
  <div className={`${bg} rounded-xl p-6 border ${border}`}>
    <div className="flex items-start space-x-3">
      <div className="p-2 bg-white/40 rounded-lg">{icon}</div>
      <div>{children}</div>
    </div>
  </div>
);

/** Reusable small button */
const ActionButton: React.FC<{
  onClick?: () => void;
  active?: boolean;
  icon: React.ReactNode;
  label: string;
}> = ({ onClick, active, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
      active ? "bg-white/30" : "bg-white/20 hover:bg-white/30"
    }`}
  >
    {icon}
    <span className="text-sm">{label}</span>
  </button>
);

export default DepositsView;
