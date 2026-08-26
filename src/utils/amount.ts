import { apiClient } from "./api";
import { parseAmountResponse } from "./apiContracts";

export const formatCurrency = (amount: number, currency = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatCrypto = (amount: number, symbol: string) => {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${symbol}`;
};

export const formatCurrencyToNGN = (amount: number, currency = "NGN") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const getCryptoUSDValue = async (amount: number, token?: string) => {
  const response = await apiClient.post<unknown>("/usd-equivalent", { token, amount });
  return parseAmountResponse(response);
};
