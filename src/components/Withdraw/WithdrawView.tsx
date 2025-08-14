import React, { useState } from 'react';
import { ArrowUpRight, AlertTriangle, CreditCard, Wallet, ChevronDown } from 'lucide-react';
import { mockBalances, formatCurrency, formatCrypto } from '../../utils/mockData';

const WithdrawView: React.FC = () => {
  const [withdrawType, setWithdrawType] = useState<'wallet' | 'fiat'>('wallet');
  const [selectedAsset, setSelectedAsset] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedBalance = mockBalances.find(b => b.symbol === selectedAsset);
  const maxAmount = selectedBalance?.amount || 0;
  const usd_value = amount ? parseFloat(amount) * (selectedBalance?.usd_value || 0) / (selectedBalance?.amount || 1) : 0;

  const handleMaxClick = () => {
    setAmount(maxAmount.toString());
  };

  const handleWithdraw = () => {
    setIsProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      alert('Withdrawal initiated successfully!');
    }, 2000);
  };

  const isValidAmount = amount && parseFloat(amount) > 0 && parseFloat(amount) <= maxAmount;
  const isValidRecipient = withdrawType === 'wallet' ? recipientAddress.length > 0 : bankAccount.length > 0;

  return (
    <div className="space-y-6">
      {/* Withdraw Type Selection */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Withdrawal Method</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setWithdrawType('wallet')}
            className={`p-4 rounded-lg border-2 transition-all ${
              withdrawType === 'wallet'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${withdrawType === 'wallet' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <Wallet className={`w-5 h-5 ${withdrawType === 'wallet' ? 'text-blue-600' : 'text-gray-600'}`} />
              </div>
              <div className="text-left">
                <div className="font-semibold text-gray-900">Crypto Wallet</div>
                <div className="text-sm text-gray-500">Send to external wallet</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setWithdrawType('fiat')}
            className={`p-4 rounded-lg border-2 transition-all ${
              withdrawType === 'fiat'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${withdrawType === 'fiat' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <CreditCard className={`w-5 h-5 ${withdrawType === 'fiat' ? 'text-blue-600' : 'text-gray-600'}`} />
              </div>
              <div className="text-left">
                <div className="font-semibold text-gray-900">Bank Account (NGN)</div>
                <div className="text-sm text-gray-500">Convert to Naira via Paystack</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Asset Selection */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Asset</h3>
        <div className="relative">
          <select
            value={selectedAsset}
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="w-full p-4 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {mockBalances.map(balance => (
              <option key={balance.symbol} value={balance.symbol}>
                {balance.symbol} - {formatCrypto(balance.amount, balance.symbol)} ({formatCurrency(balance.usd_value)})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Amount Input */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Amount</h3>
        <div className="space-y-4">
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Enter ${selectedAsset} amount`}
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleMaxClick}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-blue-600 font-medium text-sm hover:text-blue-800"
            >
              MAX
            </button>
          </div>
          
          <div className="flex justify-between text-sm text-gray-600">
            <span>Available: {formatCrypto(maxAmount, selectedAsset)}</span>
            {amount && <span>≈ {formatCurrency(usd_value)}</span>}
          </div>
        </div>
      </div>

      {/* Recipient Details */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {withdrawType === 'wallet' ? 'Recipient Wallet Address' : 'Bank Account Details'}
        </h3>
        
        {withdrawType === 'wallet' ? (
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="Enter wallet address (0x...)"
            className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="Account Number"
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Select Bank</option>
              <option value="gtbank">GTBank</option>
              <option value="access">Access Bank</option>
              <option value="zenith">Zenith Bank</option>
              <option value="first">First Bank</option>
              <option value="uba">UBA</option>
            </select>
          </div>
        )}
      </div>

      {/* Fee Estimation */}
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Breakdown</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Network Fee:</span>
            <span className="font-medium">$2.50</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Platform Fee (1%):</span>
            <span className="font-medium">{formatCurrency(usd_value * 0.01)}</span>
          </div>
          {withdrawType === 'fiat' && (
            <div className="flex justify-between">
              <span className="text-gray-600">Fiat Conversion Fee:</span>
              <span className="font-medium">$5.00</span>
            </div>
          )}
          <div className="border-t border-gray-300 pt-2 mt-2">
            <div className="flex justify-between text-base font-semibold">
              <span>Total Fees:</span>
              <span>${(2.50 + (usd_value * 0.01) + (withdrawType === 'fiat' ? 5 : 0)).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">Important:</p>
            <ul className="space-y-1 text-sm">
              <li>• Withdrawals are irreversible once processed</li>
              <li>• {withdrawType === 'wallet' ? 'Double-check the recipient address' : 'Bank transfers may take 1-3 business days'}</li>
              <li>• Contact support if you encounter any issues</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleWithdraw}
        disabled={!isValidAmount || !isValidRecipient || isProcessing}
        className={`w-full py-4 px-6 rounded-lg font-semibold transition-all ${
          isValidAmount && isValidRecipient && !isProcessing
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isProcessing ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Processing...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2">
            <ArrowUpRight className="w-5 h-5" />
            <span>
              {withdrawType === 'wallet' ? 'Withdraw to Wallet' : 'Withdraw to Bank Account'}
            </span>
          </div>
        )}
      </button>
    </div>
  );
};

export default WithdrawView;