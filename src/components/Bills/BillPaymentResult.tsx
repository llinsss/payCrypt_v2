import React from "react";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import type { BillPaymentState } from "../../utils/billsApi";

interface BillPaymentResultProps {
  payment: BillPaymentState;
  categoryName: string;
  /** Omit while the payment is still being submitted or tracked. */
  onClose?: () => void;
}

const VARIANTS = {
  pending: {
    icon: Clock,
    badge: "from-blue-500 to-purple-500",
    title: "Payment Pending",
    button: "Close",
  },
  completed: {
    icon: CheckCircle,
    badge: "from-green-500 to-emerald-500",
    title: "Payment Successful!",
    button: "Done",
  },
  failed: {
    icon: AlertCircle,
    badge: "from-red-500 to-pink-500",
    title: "Payment Failed",
    button: "Try Again",
  },
};

const BillPaymentResult: React.FC<BillPaymentResultProps> = ({ payment, categoryName, onClose }) => {
  const variant = VARIANTS[payment.status];
  const Icon = variant.icon;
  const reference = payment.reference ?? payment.transactionId;

  return (
    <div
      role="dialog"
      aria-live="polite"
      data-status={payment.status}
      className="bg-gradient-to-br from-white to-gray-50 rounded-3xl max-w-md w-full p-8 text-center border border-gray-200 shadow-2xl"
    >
      <div
        className={`w-20 h-20 bg-gradient-to-r ${variant.badge} rounded-full flex items-center justify-center mx-auto mb-6`}
      >
        <Icon className={`w-10 h-10 text-white ${payment.status === "pending" ? "animate-pulse" : ""}`} />
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-3">{variant.title}</h3>
      <p className="text-gray-600 mb-6">
        {payment.message || `Your ${categoryName} bill payment is ${payment.status}.`}
      </p>
      {reference && (
        <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-4 mb-6 border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Reference</div>
          <div className="font-mono text-sm font-semibold text-gray-800">{reference}</div>
        </div>
      )}
      {onClose && (
        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
        >
          {variant.button}
        </button>
      )}
    </div>
  );
};

export default BillPaymentResult;
