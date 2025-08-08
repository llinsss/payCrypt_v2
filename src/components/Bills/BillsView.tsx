import React, { useState } from 'react';
import { Zap, Wifi, Phone, Car, Home, CreditCard, CheckCircle, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/mockData';

const BillsView: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('electricity');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<'success' | 'failed' | null>(null);

  const billCategories = [
    { id: 'electricity', name: 'Electricity', icon: Zap, color: 'text-yellow-600' },
    { id: 'internet', name: 'Internet', icon: Wifi, color: 'text-blue-600' },
    { id: 'airtime', name: 'Airtime', icon: Phone, color: 'text-green-600' },
    { id: 'transport', name: 'Transport', icon: Car, color: 'text-purple-600' },
    { id: 'rent', name: 'Rent/Utilities', icon: Home, color: 'text-red-600' }
  ];

  const providers = {
    electricity: ['AEDC', 'EKEDC', 'IKEDC', 'PHED', 'KEDCO'],
    internet: ['MTN', 'Airtel', 'Glo', '9mobile', 'Spectranet'],
    airtime: ['MTN', 'Airtel', 'Glo', '9mobile'],
    transport: ['Lagos BRT', 'Uber', 'Bolt', 'Keke NAPEP'],
    rent: ['Property Manager', 'Landlord Direct', 'Estate Agent']
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    setPaymentResult(null);
    
    // Simulate payment processing
    setTimeout(() => {
      const success = Math.random() > 0.2; // 80% success rate
      setPaymentResult(success ? 'success' : 'failed');
      setIsProcessing(false);
      
      if (success) {
        // Reset form on success
        setTimeout(() => {
          setMeterNumber('');
          setAmount('');
          setPaymentResult(null);
        }, 3000);
      }
    }, 3000);
  };

  const isValidPayment = selectedProvider && meterNumber && amount && parseFloat(amount) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Pay Bills</h2>
        <p className="text-gray-600">Pay your utility bills with crypto or NGN</p>
      </div>

      {/* Payment Result Modal */}
      {paymentResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 text-center">
            {paymentResult === 'success' ? (
              <>
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h3>
                <p className="text-gray-600 mb-4">
                  Your {selectedCategory} bill has been paid successfully.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="text-sm text-gray-600">Transaction ID</div>
                  <div className="font-mono text-sm">#TXN{Date.now()}</div>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Payment Failed</h3>
                <p className="text-gray-600 mb-4">
                  Unable to process your payment. Please try again.
                </p>
              </>
            )}
            <button
              onClick={() => setPaymentResult(null)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Category Selection */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Bill Category</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {billCategories.map(category => {
            const Icon = category.icon;
            return (
              <button
                key={category.id}
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSelectedProvider('');
                }}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedCategory === category.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon className={`w-6 h-6 mx-auto mb-2 ${category.color}`} />
                <div className="text-sm font-medium text-gray-900">{category.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Provider Selection */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Provider</h3>
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Choose a provider</option>
          {providers[selectedCategory as keyof typeof providers]?.map(provider => (
            <option key={provider} value={provider}>{provider}</option>
          ))}
        </select>
      </div>

      {/* Bill Details */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Bill Details</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {selectedCategory === 'electricity' ? 'Meter Number' : 
               selectedCategory === 'airtime' ? 'Phone Number' : 
               'Account/Reference Number'}
            </label>
            <input
              type="text"
              value={meterNumber}
              onChange={(e) => setMeterNumber(e.target.value)}
              placeholder={selectedCategory === 'electricity' ? 'Enter meter number' : 
                          selectedCategory === 'airtime' ? 'Enter phone number' : 
                          'Enter account number'}
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount (NGN)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Payment Summary */}
      {isValidPayment && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Service:</span>
              <span className="font-medium">{selectedProvider} {selectedCategory}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount:</span>
              <span className="font-medium">{formatCurrency(parseFloat(amount), 'NGN')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Service Fee:</span>
              <span className="font-medium">₦50.00</span>
            </div>
            <div className="border-t border-gray-300 pt-2 mt-2">
              <div className="flex justify-between text-base font-semibold">
                <span>Total:</span>
                <span>{formatCurrency(parseFloat(amount) + 50, 'NGN')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pay Button */}
      <button
        onClick={handlePayment}
        disabled={!isValidPayment || isProcessing}
        className={`w-full py-4 px-6 rounded-lg font-semibold transition-all ${
          isValidPayment && !isProcessing
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isProcessing ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Processing Payment...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Pay Bill</span>
          </div>
        )}
      </button>
    </div>
  );
};

export default BillsView;