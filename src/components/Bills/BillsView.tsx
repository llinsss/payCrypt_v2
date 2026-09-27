import React, { useEffect, useState } from "react";
import {
  Zap,
  Wifi,
  Phone,
  Tv,
  CreditCard,
  CheckCircle,
  Sparkles,
  Play,
  TrendingUp,
  Shield,
} from "lucide-react";
import { formatCurrency } from "../../utils/mockData";
import {
  billsApi,
  submitBillPayment,
  type BillCategory,
  type BillPaymentState,
  type BillProvider,
} from "../../utils/billsApi";
import BillPaymentResult from "./BillPaymentResult";

const BillsView: React.FC = () => {
  const [selectedCategory, setSelectedCategory] =
    useState<BillCategory>("electricity");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [payment, setPayment] = useState<BillPaymentState | null>(null);
  const [providers, setProviders] = useState<BillProvider[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);

  const billCategories: {
    id: BillCategory;
    name: string;
    icon: typeof Zap;
    color: string;
    bgColor: string;
  }[] = [
    {
      id: "electricity",
      name: "Electricity",
      icon: Zap,
      color: "from-yellow-500 to-amber-500",
      bgColor: "from-yellow-50 to-amber-50",
    },
    {
      id: "data",
      name: "Data",
      icon: Wifi,
      color: "from-blue-500 to-cyan-500",
      bgColor: "from-blue-50 to-cyan-50",
    },
    {
      id: "airtime",
      name: "Airtime",
      icon: Phone,
      color: "from-green-500 to-emerald-500",
      bgColor: "from-green-50 to-emerald-50",
    },
    {
      id: "cable_tv",
      name: "Cable TV",
      icon: Tv,
      color: "from-purple-500 to-pink-500",
      bgColor: "from-purple-50 to-pink-50",
    },
  ];

  const categoryName =
    billCategories.find((category) => category.id === selectedCategory)?.name ??
    selectedCategory;
  const providerName =
    providers.find((provider) => provider.id === selectedProvider)?.name ??
    selectedProvider;

  useEffect(() => {
    let cancelled = false;
    setProviders([]);
    setProvidersError(null);
    billsApi
      .getProviders(selectedCategory)
      .then((list) => !cancelled && setProviders(list))
      .catch(
        (error: Error) => !cancelled && setProvidersError(error.message)
      );
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  const getInputLabel = () => {
    switch (selectedCategory) {
      case "electricity":
        return "Meter Number";
      case "airtime":
      case "data":
        return "Phone Number";
      case "cable_tv":
        return "Smart Card Number";
      default:
        return "Account Number";
    }
  };

  const getInputPlaceholder = () => {
    switch (selectedCategory) {
      case "electricity":
        return "Enter meter number";
      case "airtime":
      case "data":
        return "Enter phone number";
      case "cable_tv":
        return "Enter smart card number";
      default:
        return "Enter account number";
    }
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    const result = await submitBillPayment(
      {
        category: selectedCategory,
        provider: selectedProvider,
        phone: accountNumber,
        amount: parseFloat(amount),
      },
      { onUpdate: setPayment }
    );
    setIsProcessing(false);

    if (result.status === "completed") {
      setAccountNumber("");
      setAmount("");
    }
  };

  const isValidPayment =
    selectedProvider && accountNumber && amount && parseFloat(amount) > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl shadow-lg">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Bill Payments
        </h1>
        <p className="text-gray-600">
          Pay your bills instantly with crypto or NGN
        </p>
      </div>

      {/* Payment Result Modal */}
      {payment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <BillPaymentResult
            payment={payment}
            categoryName={categoryName}
            onClose={isProcessing ? undefined : () => setPayment(null)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Selection */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              <span>Bill Category</span>
            </h3>
            <div className="space-y-3">
              {billCategories.map((category) => {
                const Icon = category.icon;
                const isActive = selectedCategory === category.id;

                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setSelectedProvider("");
                      setAccountNumber("");
                    }}
                    className={`w-full flex items-center space-x-4 p-4 rounded-xl border-2 transition-all duration-300 ${
                      isActive
                        ? `border-transparent bg-gradient-to-r ${category.color} text-white shadow-lg transform -translate-y-0.5`
                        : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        isActive
                          ? "bg-white/20"
                          : `bg-gradient-to-r ${category.bgColor}`
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          isActive
                            ? "text-white"
                            : category.color
                                .replace("from-", "text-")
                                .split(" ")[0]
                        }`}
                      />
                    </div>
                    <span className="font-semibold">{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Provider Selection */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Service Provider
            </h3>
            <div className="relative">
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white transition-all duration-300"
              >
                <option value="">Select a provider</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            {providersError && (
              <p className="mt-2 text-sm text-red-600">{providersError}</p>
            )}
          </div>

          {/* Bill Details */}
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Payment Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {getInputLabel()}
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={getInputPlaceholder()}
                  className="w-full p-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Amount (NGN)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full p-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                />
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          {isValidPayment && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Payment Summary
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-600">Service:</span>
                  <span className="font-semibold text-gray-900">
                    {providerName} {categoryName}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(parseFloat(amount), "NGN")}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-600">Service Fee:</span>
                  <span className="font-semibold text-gray-900">₦50.00</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between text-base font-bold text-gray-900">
                    <span>Total:</span>
                    <span>
                      {formatCurrency(parseFloat(amount) + 50, "NGN")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pay Button */}
          <button
            onClick={handlePayment}
            disabled={!isValidPayment || isProcessing}
            className={`w-full py-4 px-6 rounded-xl font-semibold transition-all duration-300 ${
              isValidPayment && !isProcessing
                ? "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Processing Payment...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <Play className="w-5 h-5" />
                <span>Pay Now</span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <div className="font-semibold text-gray-900 mb-1">Instant</div>
          <div className="text-sm text-gray-600">Real-time payments</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div className="font-semibold text-gray-900 mb-1">Secure</div>
          <div className="text-sm text-gray-600">Encrypted transactions</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-5 h-5 text-purple-600" />
          </div>
          <div className="font-semibold text-gray-900 mb-1">Reliable</div>
          <div className="text-sm text-gray-600">99.9% success rate</div>
        </div>
      </div>
    </div>
  );
};

export default BillsView;
