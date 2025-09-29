import React, { useState } from 'react';
import { Plus, Minus, Users, DollarSign, Send } from 'lucide-react';
import { formatCurrency } from '../../utils/mockData';

interface Recipient {
  id: string;
  tag: string;
  percentage: number;
  amount: number;
}

const SplitPaymentView: React.FC = () => {
  const [totalAmount, setTotalAmount] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: '1', tag: '', percentage: 50, amount: 0 },
    { id: '2', tag: '', percentage: 50, amount: 0 }
  ]);
  const [splitType, setSplitType] = useState<'equal' | 'percentage' | 'custom'>('equal');
  const [isProcessing, setIsProcessing] = useState(false);

  const updateAmounts = (newRecipients: Recipient[], amount: string) => {
    const total = parseFloat(amount) || 0;
    
    if (splitType === 'equal') {
      const equalAmount = total / newRecipients.length;
      return newRecipients.map(r => ({ ...r, amount: equalAmount, percentage: 100 / newRecipients.length }));
    } else if (splitType === 'percentage') {
      return newRecipients.map(r => ({ ...r, amount: (total * r.percentage) / 100 }));
    }
    
    return newRecipients;
  };

  const handleAmountChange = (amount: string) => {
    setTotalAmount(amount);
    setRecipients(prev => updateAmounts(prev, amount));
  };

  const addRecipient = () => {
    const newRecipient: Recipient = {
      id: Date.now().toString(),
      tag: '',
      percentage: 0,
      amount: 0
    };
    const newRecipients = [...recipients, newRecipient];
    setRecipients(updateAmounts(newRecipients, totalAmount));
  };

  const removeRecipient = (id: string) => {
    if (recipients.length > 2) {
      const newRecipients = recipients.filter(r => r.id !== id);
      setRecipients(updateAmounts(newRecipients, totalAmount));
    }
  };

  const updateRecipient = (id: string, field: keyof Recipient, value: string | number) => {
    const newRecipients = recipients.map(r => 
      r.id === id ? { ...r, [field]: value } : r
    );
    setRecipients(updateAmounts(newRecipients, totalAmount));
  };

  const handleSplitTypeChange = (type: 'equal' | 'percentage' | 'custom') => {
    setSplitType(type);
    setRecipients(prev => updateAmounts(prev, totalAmount));
  };

  const handleSendPayment = () => {
    setIsProcessing(true);
    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(false);
      alert('Split payment sent successfully!');
    }, 2000);
  };

  const totalPercentage = recipients.reduce((sum, r) => sum + r.percentage, 0);
  const totalCalculated = recipients.reduce((sum, r) => sum + r.amount, 0);
  const isValid = recipients.every(r => r.tag.trim() !== '') && 
                  totalAmount && 
                  parseFloat(totalAmount) > 0 &&
                  (splitType !== 'percentage' || Math.abs(totalPercentage - 100) < 0.01);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Split Payment</h2>
        <p className="text-gray-600">Send payments to multiple recipients automatically</p>
      </div>

      {/* Total Amount */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Total Amount</h3>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="number"
            value={totalAmount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="Enter total amount to split"
            className="w-full pl-10 pr-4 py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xl font-semibold"
          />
        </div>
      </div>

      {/* Split Type */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Split Method</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { type: 'equal' as const, label: 'Equal Split', desc: 'Divide equally among all recipients' },
            { type: 'percentage' as const, label: 'Percentage', desc: 'Set custom percentages for each recipient' },
            { type: 'custom' as const, label: 'Custom Amount', desc: 'Set specific amounts for each recipient' }
          ].map(option => (
            <button
              key={option.type}
              onClick={() => handleSplitTypeChange(option.type)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                splitType === option.type
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900">{option.label}</div>
              <div className="text-sm text-gray-500 mt-1">{option.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recipients</h3>
          <button
            onClick={addRecipient}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Recipient</span>
          </button>
        </div>

        <div className="space-y-4">
          {recipients.map((recipient, index) => (
            <div key={recipient.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-gray-900">Recipient {index + 1}</span>
                </div>
                {recipients.length > 2 && (
                  <button
                    onClick={() => removeRecipient(recipient.id)}
                    className="text-red-600 hover:text-red-800 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">TaggedPay Tag</label>
                  <input
                    type="text"
                    value={recipient.tag}
                    onChange={(e) => updateRecipient(recipient.id, 'tag', e.target.value)}
                    placeholder="@username"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {splitType === 'percentage' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Percentage</label>
                    <input
                      type="number"
                      value={recipient.percentage}
                      onChange={(e) => updateRecipient(recipient.id, 'percentage', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <div className="text-lg font-semibold text-gray-900 px-3 py-2 bg-white border border-gray-300 rounded-lg">
                    {formatCurrency(recipient.amount)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-blue-700">Total to be sent:</div>
              <div className="text-xl font-bold text-blue-900">{formatCurrency(totalCalculated)}</div>
            </div>
            {splitType === 'percentage' && (
              <div className="text-right">
                <div className="text-sm text-blue-700">Total percentage:</div>
                <div className={`text-xl font-bold ${Math.abs(totalPercentage - 100) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {totalPercentage.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Send Button */}
      <button
        onClick={handleSendPayment}
        disabled={!isValid || isProcessing}
        className={`w-full py-4 px-6 rounded-lg font-semibold transition-all ${
          isValid && !isProcessing
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isProcessing ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Sending Payments...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2">
            <Send className="w-5 h-5" />
            <span>Send Split Payment</span>
          </div>
        )}
      </button>
    </div>
  );
};

export default SplitPaymentView;